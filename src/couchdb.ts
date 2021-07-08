import { Observer, Observable, Subject, BehaviorSubject, combineLatest, of, Subscription, timer} from 'rxjs';
import {
  distinctUntilChanged,
  take,
  map,
  mergeAll,
  tap,
  skip,
  takeUntil,
  finalize,
  filter,
  flatMap,
} from 'rxjs/operators';

import {
  FetchBehavior,
  HttpRequest,
  ServerErrorResponse,
} from '@mkeen/rxhttp';

import { CouchUrls } from './couchurls';

import {
  IDS,
  COOKIE,
  TRACK_CHANGES,
  AUTHENTICATED,
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
  CouchDBGenericResponse,
  CouchDBUUIDSResponse,
  CouchDBSecurity,
} from './types';

import { CouchDBSession } from './couchdbsession';

import { entityOrDefault, nextIfChanged } from './sugar';

import { CouchDBDocumentCollection } from './couchdbdocumentcollection';

export class CouchDB {
  public documents: CouchDBDocumentCollection = new CouchDBDocumentCollection();

  readonly databaseName: BehaviorSubject<string>;
  readonly host: BehaviorSubject<string>;
  readonly port: BehaviorSubject<number>;
  readonly ssl: BehaviorSubject<boolean>;
  readonly trackChanges: BehaviorSubject<boolean>;
  readonly changeFeedAbort: Subject<boolean> = new Subject();

  private appDocChanges: CouchDBAppChangesSubscriptions = {};
  private changeFeedSubscription: Subscription | null = null;

  constructor(
    rxCouchConfig: RxCouchConfig,
    public couchSession: CouchDBSession = new CouchDBSession(AuthorizationBehavior.open),
    private rxhttpDebug: boolean = false,
  ) {
    rxCouchConfig = Object.assign({}, rxCouchConfig);

    this.databaseName = new BehaviorSubject<string>(entityOrDefault(rxCouchConfig.dbName, '_users'));
    this.host = new BehaviorSubject<string>(entityOrDefault(rxCouchConfig.host, '127.0.0.1'));
    this.port = new BehaviorSubject<number>(entityOrDefault(rxCouchConfig.port, 5984));
    this.ssl = new BehaviorSubject<boolean>(entityOrDefault(rxCouchConfig.ssl, false));
    this.trackChanges = new BehaviorSubject<boolean>(entityOrDefault(rxCouchConfig.trackChanges, true));

    this.config()
      .pipe(
        distinctUntilChanged(),
      ).subscribe((config: WatcherConfig) => {
        const idsEmpty = config[IDS].length === 0;
        if(idsEmpty || !config[TRACK_CHANGES]) {
          this.closeChangeFeed();
        } else {
          this.configureChangeFeed(config);
        }

      }

    );

  }

  public configureChangeFeed(config: WatcherConfig) {
    if (this.changeFeedSubscription) {
      this.changeFeedAbort.next(true);
      this.changeFeedSubscription.unsubscribe();
      this.changeFeedSubscription = null;
    }

    this.changeFeedSubscription = this.changes(this.changeFeedAbort, config).pipe(takeUntil(this.changeFeedAbort)).subscribe((update) => {
      if (this.documents.changed(update.doc)) {
        this.stopListeningForLocalChanges(update.doc._id);
        this.documents.doc(update.doc);
        this.listenForLocalChanges(update.doc._id);
      }

    });

  }

  public reconfigure(rxCouchConfig: RxCouchConfig) {
    nextIfChanged(this.databaseName, rxCouchConfig.dbName);
    nextIfChanged(this.host, rxCouchConfig.host);
    nextIfChanged(this.port, rxCouchConfig.port);
    nextIfChanged(this.ssl, rxCouchConfig.ssl);
    nextIfChanged(this.trackChanges, rxCouchConfig.trackChanges);
  }

  private closeChangeFeed() {
    this.changeFeedAbort.next(true);
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
    if (typeof (document) === 'string') {
      if (this.documents.isKnownDocument(document)) {
        this.listenForLocalChanges(document);
        return this.documents.doc(document);
      } else {
        return this.getDocument(document);
      }

    } else {
      if (this.documents.changed(document)) {
        return this.saveDocument(document).pipe(flatMap());

      } else {
        return this.documents.doc(document._id);
      }

    }

  }

  public find(query: CouchDBFindQuery): Observable<CouchDBDocument[]> {
    return Observable.create((observer: Observer<CouchDBDocument[]>): void => {
      this.config().pipe(
        filter(config => config[AUTHENTICATED]),
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

  public changes(
    stopChanges: Subject<boolean> = new Subject(),
    config?: WatcherConfig,
  ): Observable<CouchDBChanges> {
    return Observable.create((observer: Observer<CouchDBChanges>) => {
      if(!config) {
        this.config().pipe(
          filter(config => config[AUTHENTICATED]),
          take(1)
        ).subscribe((config) => {
          return this.durableHttpRequest<CouchDBChanges>(
            config,
            CouchUrls.changes(config),
            observer,
            stopChanges,
            FetchBehavior.stream
          );
  
        });

      } else {
        return this.durableHttpRequest<CouchDBChanges>(
          config,
          CouchUrls.changesWithIds(config),
          observer,
          stopChanges,
          FetchBehavior.stream,
          'POST',
          { doc_ids: config[IDS] }
        )

      }

    }).pipe(
      finalize(() => stopChanges.next(true)),
      filter(update => !(<any>update).last_seq)
    );

  }

  public delete(docId: string, revId: string) {
    return this.config().pipe(
      filter(config => config[AUTHENTICATED]),
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBGenericResponse>(
            config,
            CouchUrls.documentDelete(config, docId, revId),
            FetchBehavior.simple,
            'DELETE'
        )
      }),
      mergeAll(),
      take(1),
    );
  }

  public edit(docs: CouchDBDocument[]) {
    return this.bulkModify(docs);
  }

  public all() {
    return this.config().pipe(
      filter(config => config[AUTHENTICATED]),
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBGenericResponse>(
          config,
          CouchUrls._all_docs(
            config
          ),

          FetchBehavior.simple,
          'GET'
        )

      }),
      mergeAll(),
      take(1),
    );

  }

  public createDb(name: string) {
    return this.config().pipe(
      filter(config => config[AUTHENTICATED]),
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
      mergeAll(),
      take(1),
    );

  }

  public deleteDb(name: string) {
    return this.config().pipe(
      filter(config => config[AUTHENTICATED]),
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBGenericResponse>(
          config,
          CouchUrls.database(
            config,
            name
          ),

          FetchBehavior.simple,
          'DELETE'
        )

      }),
      mergeAll(),
      take(1),
    );

  }

  public secureDb(name: string, securityObject: CouchDBSecurity) {
    return this.config().pipe(
      filter(config => config[AUTHENTICATED]),
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBGenericResponse>(
          config,
          CouchUrls.databaseSecurity(
            config,
            name
          ),

          FetchBehavior.simple,
          'PUT',
          securityObject
        );

      }),
      mergeAll(),
      take(1),
    );

  }

  public uuids(count: number = 1) {
    return this.config().pipe(
      filter(config => config[AUTHENTICATED]),
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBUUIDSResponse>(
          config,
          CouchUrls.uuids(
            config,
            count
          ),

          FetchBehavior.simple,
          'GET'
        );

      }),
      mergeAll(),
      take(1),
    );

  }

  public bulkModify(docs: CouchDBDocument[]): Observable<CouchDBGenericResponse[]> {
    return this.config().pipe(
      filter(config => config[AUTHENTICATED]),
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBGenericResponse[]>(
          config,
          CouchUrls.bulkDocs(
            config
          ),

          FetchBehavior.simple,
          'POST',
          JSON.stringify({docs})
        );

      }),
      mergeAll(),
      take(1),
    );
  
  }

  private getDocument(
    documentId: string,
  ): Observable<BehaviorSubject<CouchDBDocument>> {
    return this.config().pipe(
      filter(config => config[AUTHENTICATED]),
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequestWithAuthRetry<CouchDBDocument>(
          config,
          CouchUrls.document(
            config,
            documentId,
          ),

          FetchBehavior.simple,
          'GET'
        );

      }),
      mergeAll(),
      take(1),
      map((document: CouchDBDocument) => {
        return this.documents.doc(document);
      }),
    )
  }

  private saveDocument(
    document: CouchDBDocument | CouchDBPreDocument
  ): Observable<BehaviorSubject<CouchDBDocument>> {
    return this.config().pipe(
      filter(config => config[AUTHENTICATED]),
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
      mergeAll(),
      map((response: CouchDBDocumentRevisionResponse) => this.documents.doc(response.id)),
      take(1)
    );

  }

  private durableHttpRequest<T>(
    config: WatcherConfig,
    url: string,
    observer: Observer<T>,
    stopChanges: Subject<boolean>,
    behavior: FetchBehavior = FetchBehavior.stream,
    method: string = 'POST',
    body: any = { },
    httpRequest = this.httpRequest<T>(
      config,
      url,
      behavior,
      method,
      body && typeof(body) === 'object' ? JSON.stringify(body) : body,
    ),
    cycle: number = 1,
    backoff: number = 100
  ) {
    body = body && typeof(body) === 'object' ? JSON.stringify(body) : body;

    httpRequest.fetch().pipe(takeUntil(stopChanges))
      .subscribe((response: T) => {
        observer.next(response);
      },
      
      (errorInfo) => {
        if (errorInfo.errorCode === 401) {
          (!this.couchSession?.loginAttemptMade.value ? this.couchSession?.authenticate : this.couchSession?.reauthenticate)().pipe(take(1)).subscribe((success) => {
            if (success) {
              this.durableHttpRequest<T>(
                config,
                url,
                observer,
                stopChanges,
                behavior,
                method,
                body,
                undefined,
                cycle + 1 < 10 ? cycle + 1 : 10,
                backoff
              );

            } else {
              observer.error(errorInfo)
            }

          });

        } else if (!errorInfo.errorCode) {
          timer(backoff * cycle).pipe(take(1)).subscribe((_complete) => {
            this.durableHttpRequest<T>(
              config,
              url,
              observer,
              stopChanges,
              behavior,
              method,
              body,
              undefined,
              cycle + 1 < 10 ? cycle + 1 : 10,
              backoff
            );

          });

        }

      },
      
      () => {
        timer(backoff * cycle).pipe(take(1)).subscribe((_complete) => {
          this.durableHttpRequest<T>(
            config,
            url,
            observer,
            stopChanges,
            behavior,
            method,
            body,
            undefined,
            cycle + 1 < 10 ? cycle + 1 : 10,
            backoff
          );

        })

      });

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
          console.log(`[rxcouch] auth failed ${JSON.stringify(errorMessage)}`);
          (!this.couchSession?.loginAttemptMade.value ? this.couchSession?.authenticate : this.couchSession?.reauthenticate)().pipe(take(1)).subscribe((authResponse: boolean) => {
            if (authResponse) {
              observer.next(this.httpRequestWithAuthRetry<T>(
                config,
                url,
                behavior,
                method,
                body
              ));

            } else {
              console.log(`[rxcouch] REauth failed ${JSON.stringify(errorMessage)}`);
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

      },
      
      () => {
        
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
      behavior,
      !this.rxhttpDebug,
    );

  }

  private httpRequestOptions(config: WatcherConfig, method: string, body: string): RequestInit {
    let httpOptions: RequestInit = {
      method
    }

    if (body) {
      httpOptions.body = body;
    }

    if (config[COOKIE].length) {
      // If cookie auth is being used in browser, it will be implicitly sent with all outgoing requests. The below
      // has process === 'object' present because we don't manually inject this header unless running on node.
      if (this.couchSession.authorizationBehavior === AuthorizationBehavior.cookie && typeof process === 'object') {
        httpOptions.headers = {
          Cookie: this.cookieForRequestHeader(config[COOKIE]),
        }

      } else if (this.couchSession.authorizationBehavior === AuthorizationBehavior.jwt) {
        httpOptions.headers = {
          Authorization: "Bearer ${config[COOKIE]}",
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
