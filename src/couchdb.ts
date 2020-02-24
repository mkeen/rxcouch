import { Observer, Observable, Subject, BehaviorSubject, combineLatest, of } from 'rxjs';
import { distinctUntilChanged, take, map, mergeAll, tap, skip, takeUntil, debounceTime, finalize } from 'rxjs/operators';

import {
  FetchBehavior,
  HttpRequest,
  HttpRequestOptions,
  ServerErrorResponse,
} from '@mkeen/rxhttp';

import { CouchUrls } from './couchurls';

import {
  RxCouchConfig,
  CouchDBChanges,
  CouchDBDocumentRevisionResponse,
  CouchDBDocument,
  WatcherConfig,
  CouchDBPreDocument,
  CouchDBAppChangesSubscriptions,
  AuthorizationBehavior,
  CouchDBFindQuery,
  CouchDBFindResponse,
  CouchDBGenericResponse
} from './types';

import { CouchSession } from './couchsession';

import {
  IDS,
  COOKIE,
  TRACK_CHANGES,
  AUTHENTICATED,
  LOCALHOST
} from './enums';

import { entityOrDefault, nextIfChanged } from './sugar';

import { CouchDBDocumentCollection } from './couchdbdocumentcollection';

export class CouchDB {
  public documents: CouchDBDocumentCollection = new CouchDBDocumentCollection();
  private changeFeedAbort: Subject<boolean> = new Subject();
  private appDocChanges: CouchDBAppChangesSubscriptions = {};
  private changeFeedHttpRequest: HttpRequest<CouchDBChanges> | null = null;
  private databaseName: BehaviorSubject<string>;
  private host: BehaviorSubject<string>;
  private port: BehaviorSubject<number>;
  private ssl: BehaviorSubject<boolean>;
  private trackChanges: BehaviorSubject<boolean>;

  constructor(
    rxCouchConfig: RxCouchConfig,
    public couchSession: CouchSession = new CouchSession(
      AuthorizationBehavior.open
    )
  ) {
    rxCouchConfig = Object.assign({}, rxCouchConfig);

    this.databaseName =
      new BehaviorSubject<string>(entityOrDefault(rxCouchConfig.dbName, '_users'));

    this.host =
      new BehaviorSubject<string>(entityOrDefault(rxCouchConfig.host, LOCALHOST));

    this.port =
      new BehaviorSubject<number>(entityOrDefault(rxCouchConfig.port, 5984));

    this.ssl =
      new BehaviorSubject<boolean>(entityOrDefault(rxCouchConfig.ssl, false));

    this.trackChanges =
      new BehaviorSubject<boolean>(entityOrDefault(rxCouchConfig.trackChanges, true));

    this.config()
      .pipe(
        distinctUntilChanged(),
        debounceTime(0),
      ).subscribe((config: WatcherConfig) => {
        const idsEmpty = config[IDS].length === 0;
        if(idsEmpty || !config[TRACK_CHANGES]) {
          this.closeChangeFeed();
        } else if(config[AUTHENTICATED] || this.couchSession.authorizationBehavior === AuthorizationBehavior.open) {
          this.configureChangeFeed(config);
        }

      }

    );

  }

  public reconfigure(rxCouchConfig: RxCouchConfig) {
    nextIfChanged(this.databaseName, rxCouchConfig.dbName);
    nextIfChanged(this.host, rxCouchConfig.host);
    nextIfChanged(this.port, rxCouchConfig.port);
    nextIfChanged(this.ssl, rxCouchConfig.ssl);
    nextIfChanged(this.trackChanges, rxCouchConfig.trackChanges);
  }

  public closeChangeFeed() {
    this.changeFeedAbort.next(true);
  }

  public configureChangeFeed(config: WatcherConfig) {
    const requestUrl = CouchUrls.watch(config);
    const ids = JSON.stringify({
      'doc_ids': config[IDS]
    });

    this.httpRequestWithAuthRetry<CouchDBChanges>(
      config,
      requestUrl,
      FetchBehavior.stream, 'POST',
      JSON.stringify({
        'doc_ids': config[IDS]
      }),
    ).pipe(
      takeUntil(this.changeFeedAbort)
    ).subscribe((update: CouchDBChanges) => {
      if (update.last_seq !== undefined) {
        this.configureChangeFeed(config);
      } else {
        if (this.documents.changed(update.doc)) {
          this.stopListeningForLocalChanges(update.doc._id);
          this.documents.doc(update.doc);
          this.listenForLocalChanges(update.doc._id);
        }

      }

    },

    (error: any) => {
      // This (maybe) won't ever happen right now. Need to look more into this.
      // * above statement is wrong. This does happen if the server goes down. Need to reconnect. Confirmed on node. Not sure about browser
      console.log("feed error", error);
    },

    () => {
      return this.config().pipe(take(1)).subscribe((config) => {
        const idsEmpty = config[IDS].length === 0;
        if(idsEmpty || !config[TRACK_CHANGES]) {
          return null;
        } else if(config[AUTHENTICATED] || this.couchSession?.authorizationBehavior === AuthorizationBehavior.open) {
          this.configureChangeFeed(config);
        }
      });

    });

  }

  public config(): Observable<WatcherConfig> {
    return combineLatest(
      this.documents.ids,
      this.databaseName,
      this.host,
      this.port,
      this.ssl,
      this.couchSession.cookie,
      this.trackChanges,
      this.couchSession.authenticated
    );

  }

  public doc(document: CouchDBDocument | CouchDBPreDocument | string): BehaviorSubject<CouchDBDocument> {
    return Observable.create((observer: Observer<BehaviorSubject<CouchDBDocument>>): void => {
      if (typeof (document) === 'string') {
        if (this.documents.isKnownDocument(document)) {
          observer.next(this.documents.doc(document));
          this.listenForLocalChanges(document);
        } else {
          this.getDocument(document, observer);
        }

      } else {
        if (this.documents.changed(document)) {
          this.saveDocument(document).pipe(take(1)).subscribe((doc) => {
            document._rev = doc.rev;
            document._id = doc.id;
            observer.next(this.documents.doc(<CouchDBDocument>document));
          },

          (err) => {
            observer.error(err);
          },

          () => {
            observer.complete();
          });

        } else {
          observer.next(this.documents.doc(document._id));
        }

      }

    }).pipe(mergeAll());

  }

  public find(query: CouchDBFindQuery): Observable<CouchDBDocument[]> {
    return Observable.create((observer: Observer<CouchDBDocument[]>): void => {
      this.config().pipe(
        take(1),
        map((config: WatcherConfig) => {
          return this.httpRequestWithAuthRetry<CouchDBFindResponse>(
            config,
            CouchUrls.find(config),
            FetchBehavior.simpleWithHeaders,
            'POST',
            JSON.stringify(query)
          );

        }),

        mergeAll(),
        take(1),
        map((findResponse: CouchDBFindResponse) => {
          return findResponse.docs.map(document => document);
        })

      ).subscribe((documents: CouchDBDocument[]) => {
        observer.next(documents);
      });

    });

  }

  public changes(): Observable<CouchDBChanges> {
    const stopChanges: Subject<boolean> = new Subject();
    return Observable.create((observer: Observer<CouchDBChanges>) => {
      this.config().pipe(take(1)).subscribe((config: WatcherConfig) => {
        const url = CouchUrls.changes(
          config
        );

        const behavior = FetchBehavior.stream;
        const method = 'GET';

        this.httpRequestWithAuthRetry<CouchDBChanges>(
          config,
          url,
          behavior,
          method
        ).pipe(takeUntil(stopChanges)).subscribe(
          (response: CouchDBChanges) => {
            if (response.last_seq !== undefined) {
              stopChanges.next(true);
            } else {
              observer.next(response);
            }

          },

          (err) => {
            observer.error(err);
          },

          () => {
            observer.complete();
          }

        );

      });

    }).pipe(finalize(
      () => {
        stopChanges.next(true);
      }

    ));

  }

  public delete(documentId: string) {
    return Observable.create((observer: Observer<CouchDBGenericResponse>): void => {
      this.deleteDocument(documentId, observer);
    });

  }

  public createDb(name: string) {
    return this.config().pipe(
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBGenericResponse>(
          config,
          CouchUrls.database(
            config,
            name
          ),

          FetchBehavior.simple,
          'PUT'
        )

      }),
      mergeAll()
    );

  }

  public uuids(count: number = 1) {
    return this.config().pipe(
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBGenericResponse>(
          config,
          CouchUrls.uuids(
            config,
            count
          ),

          FetchBehavior.simple,
          'GET'
        );

      }),
      mergeAll()
    );

  }

  private deleteDocument(
    documentId: string,
    observer: Observer<CouchDBGenericResponse> // make this api better. having to pass in an observable is weird. would
  ): void {                                   // be better if this returned an observable that emitted the behaviorsubject
    this.config().pipe(
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBGenericResponse>(
          config,
          CouchUrls.document(
            config,
            documentId,
          ),

          FetchBehavior.simple,
          'DELETE'
        );

      }),
      mergeAll()
    ).subscribe((response: CouchDBGenericResponse) => {
      if(response.ok) {
        this.stopListeningForLocalChanges(response.id);
        this.documents.remove(response.id);
        observer.next(response);
      } else {
        observer.error(response)
      }

      observer.complete();
    });

  }

  private getDocument(
    documentId: string,
    observer: Observer<BehaviorSubject<CouchDBDocument>> // make this api better. having to pass in an observable is weird. would
  ): void {                                              // be better if this returned an observable that emitted the behaviorsubject
    this.config().pipe(
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBDocumentRevisionResponse>(
          config,
          CouchUrls.document(
            config,
            documentId,
          ),

          FetchBehavior.simple,
          'GET'
        );

      }),
      mergeAll()
    ).subscribe((doc: any) => {
      if (this.documents.isValidCouchDBDocument(doc)) {
        observer.next(this.documents.doc(doc));
        this.listenForLocalChanges(doc._id);
      } else {
        // todo. use partial document as a find query and return result IF there is exactly one result. otherwise, error
        observer.error(doc)
      }

      observer.complete();
    },

    (err) => observer.error(err),
    () => observer.complete());

  }

  private saveDocument(
    document: CouchDBDocument | CouchDBPreDocument
  ): Observable<CouchDBDocumentRevisionResponse> {
    return this.config().pipe(
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBDocumentRevisionResponse>(
          config,
          CouchUrls.document(
            config,
            !this.documents.isPreDocument(document) ? document._id : undefined,
          ),

          FetchBehavior.simple,
          this.documents.isPreDocument(document) ? 'POST' : 'PUT',
          JSON.stringify(document)
        );

      }),
      mergeAll()
    );

  }

  private httpRequestWithAuthRetry<T>(
    config: WatcherConfig,
    url: string,
    behavior: FetchBehavior = FetchBehavior.simpleWithHeaders,
    method: string = 'GET',
    body: any = undefined,
    httpRequest = this.httpRequest<T>(
      config,
      url,
      behavior,
      method,
      body,
    )

  ): Observable<T> {
    return Observable.create((observer: Observer<Observable<T>>): void => {
      (behavior === FetchBehavior.simpleWithHeaders ?
        (<Observable<any>>httpRequest.fetch()).pipe(
          tap(this.couchSession?.saveCookie),
          map(this.couchSession ? this.couchSession.extractResponse : (_a) => null)) :
        httpRequest.fetch()
      ).subscribe((response: T) => {
        observer.next(of(response));
      },

      (errorMessage: ServerErrorResponse) => {
        if (errorMessage.errorCode === 401 || errorMessage.errorCode === 403) {
          this.couchSession?.authenticated.next(false);
          this.couchSession?.cookie.next('');
          this.couchSession?.authenticate().pipe(take(1)).subscribe((authResponse: boolean) => {
            if (authResponse) {
              this.config().pipe(take(1)).subscribe((config: WatcherConfig) => {
                observer.next(this.httpRequestWithAuthRetry<T>(
                  config,
                  url,
                  behavior,
                  method,
                  body
                ));

              });

            } else {
              observer.error(errorMessage);
            }

          },

          (error) => {
            observer.error(error);
          },

          () => {
            // Some day, possibly use this as a hook for retrying connections
          });

        } else {
          observer.error(errorMessage);
        }

      });

    }).pipe(mergeAll(), finalize(() => {
      httpRequest.cancel();
    }));

  }

  private httpRequest<T>(
    config: WatcherConfig,
    url: string,
    behavior: FetchBehavior = FetchBehavior.simpleWithHeaders,
    method: string = 'GET',
    body: any = undefined,
  ): HttpRequest<T> {
    return new HttpRequest<T>(
      url,
      this.httpRequestOptions(config, method, body),
      behavior
    );

  }

  private httpRequestOptions(config: WatcherConfig, method: string, body: string): HttpRequestOptions {
    let httpOptions: HttpRequestOptions = {
      method
    }

    if (body) {
      httpOptions.body = body;
    }

    if (config[COOKIE] !== null) {
      if ((<string>config[COOKIE]).length && typeof process === 'object') { // Todo: Type hint and length check really necessary?
        httpOptions['headers'] = {
          'Cookie': this.cookieForRequestHeader((<string>config[COOKIE])) // Todo: Why is type hint needed when inside the null check?
        }

      }

    }

    return httpOptions;
  }

  private cookieForRequestHeader(cookie: string): string {
    return cookie.split(';')[0].trim();
  }

  private stopListeningForLocalChanges(doc_id: string): void {
    if (this.appDocChanges[doc_id] !== undefined) {
      this.appDocChanges[doc_id].unsubscribe();
      delete this.appDocChanges[doc_id];
    }

  }

  private listenForLocalChanges(doc_id: string): void {
    if (this.appDocChanges[doc_id] === undefined) { // kind of a gross way to check if we're already listening. shouldn't be necessary.
      this.appDocChanges[doc_id] = this.documents.doc(doc_id).pipe(skip(1)).subscribe((changedDoc: any) => {
        if (doc_id !== changedDoc._id) {
          console.warn('document mismatch. change ignored.'); // this is only here because its possible to change a doc id.
          return;                                             // and i havent even attempted to handle that case yet.
        }

        if (this.documents.changed(changedDoc)) {
          this.stopListeningForLocalChanges(changedDoc._id);
          this.doc(changedDoc).pipe(take(1)).subscribe((_e: any) => { });
        }

      });

    }

  }

}
