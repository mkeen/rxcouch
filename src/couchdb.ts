import { Observer, Observable, Subject, BehaviorSubject, combineLatest, of } from 'rxjs';
import { distinctUntilChanged, take, map, mergeAll, tap, skip, takeUntil, debounceTime, filter } from 'rxjs/operators';

import {
  FetchBehavior,
  HttpRequest,
  HttpRequestOptions,
  HttpResponseWithHeaders,
  ServerErrorResponse,
} from '@mkeen/rxhttp';

import { CouchUrls } from './couchurls';

import {
  RxCouchConfig,
  CouchDBChanges,
  CouchDBDocumentRevisionResponse,
  CouchDBDocument,
  CouchDBDesignViewOptions,
  CouchDBDesignView,
  CouchDBDesignList,
  WatcherConfig,
  CouchDBPreDocument,
  CouchDBAppChangesSubscriptions,
  CouchDBAuthenticationResponse,
  AuthorizationBehavior,
  CouchDBCredentials,
  CouchDBFindQuery,
  CouchDBFindResponse,
  CouchDBSession,
  CouchDBBasicResponse,
  CouchDBUserContext
} from './types';

import {
  IDS,
  COOKIE,
  TRACK_CHANGES,
  AUTHENTICATED,
  LOCALHOST
} from './enums';

import { entityOrDefault } from './sugar';

import { CouchDBDocumentCollection } from './couchdbdocumentcollection';

export class CouchDB {
  public authenticated: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public documents: CouchDBDocumentCollection = new CouchDBDocumentCollection();
  public loginAttemptMade: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public userSession: BehaviorSubject<CouchDBSession | null> = new BehaviorSubject<CouchDBSession | null>(null);
  public cookie: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);
  public context: BehaviorSubject<CouchDBUserContext | null> = new BehaviorSubject<CouchDBUserContext | null>(null);

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
    public auth: AuthorizationBehavior = AuthorizationBehavior.open,
    public credentials: Observable<CouchDBCredentials> | null = null
  ) {
    rxCouchConfig = Object.assign({}, rxCouchConfig);

    this.databaseName =
      new BehaviorSubject<string>(rxCouchConfig.dbName);

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
        } else if(config[AUTHENTICATED] || this.auth === AuthorizationBehavior.open) {
          this.configureChangeFeed(config);
        }

      }

    );

    if (this.credentials) {
      this.credentials.subscribe((couchDbCreds: CouchDBCredentials) => { // memory leak.. need to unsub
        this.authenticate(couchDbCreds).pipe(take(1)).subscribe((_authSuccess) => {
          if (!this.authenticated.value) {
            this.authenticated.next(true);
          }

        },

        (_error) => {
          if (!!this.authenticated.value) {
            this.authenticated.next(false);
          }

        });

      });

    }

  }

  public authenticate(providedCredentials?: CouchDBCredentials): Observable<boolean> {
    return Observable.create((observer: Observer<boolean>) => {
      if (this.auth === AuthorizationBehavior.cookie) {
        if (providedCredentials) {
          const { username, password } = providedCredentials;
          this.attemptNewAuthentication(username, password).pipe(take(1)).subscribe(
            (authResponse: CouchDBAuthenticationResponse) => {
              if (this.authenticated.value !== true) {
                this.authenticated.next(true);
              }

              delete authResponse.ok;
              this.context.next(<CouchDBUserContext>authResponse);

              observer.next(true);
            },

            (_error) => {
              this.context.next(null);
              observer.error(false);
              observer.complete();
            }

          );

        } else {
          if (this.loginAttemptMade.value === false) {
            this.loginAttemptMade.next(true);
            this.session().pipe(take(1)).subscribe(
              (session: CouchDBSession) => {
                const { ok, userCtx } = session;
                const authenticated = !!userCtx.name;

                if (this.authenticated.value !== authenticated) {
                  this.authenticated.next(authenticated);
                  if (ok) {
                    this.context.next(session.userCtx);
                    observer.next(true);
                  }

                }

                this.context.next(null);
                observer.error(false);
              }

            );

          } else {
            this.context.next(null);
            observer.error(false);
          }

        }

      }

    });

  }

  public closeChangeFeed() {
    if(this.changeFeedHttpRequest) {
      this.changeFeedHttpRequest.cancel();
    }

    this.changeFeedAbort.next(true);
  }

  public configureChangeFeed(config: WatcherConfig) {
    this.changeFeedAbort.next(true);
    const requestUrl = CouchUrls.watch(config);
    const ids = JSON.stringify({
      'doc_ids': config[IDS]
    });

    if (this.changeFeedHttpRequest) {
      this.changeFeedHttpRequest.reconfigure(requestUrl, this.httpRequestOptions(config, 'POST', ids), FetchBehavior.stream);
    } else {
      this.changeFeedHttpRequest = this.httpRequest<CouchDBChanges>(
        config,
        requestUrl,
        FetchBehavior.stream,
        'POST',
        ids
      );

    }

    this.httpRequestWithAuthRetry<CouchDBChanges>(
      config,
      requestUrl,
      FetchBehavior.stream, 'POST',
      JSON.stringify({
        'doc_ids': config[IDS]
      }),

      this.changeFeedHttpRequest
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
      // This won't ever happen right now. Need to look more into this.
      // * above statement is wrong. This does happen if the server goes down. Need to reconnect. Confirmed on node. Not sure about browser
      console.log("feed error", error);
    },

    () => {
      //this.reconnectToChangeFeed(config);
    });

  }

  public config(): Observable<WatcherConfig> {
    return combineLatest(
      this.documents.ids,
      this.databaseName,
      this.host,
      this.port,
      this.ssl,
      this.cookie,
      this.trackChanges,
      this.authenticated
    );

  }

  public design<T>(
    designName: string,
    designType: CouchDBDesignView | CouchDBDesignList,
    designTypeName: string,
    options?: CouchDBDesignViewOptions
  ): Observable<T> {
    return this.config().pipe(
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequest<T>(
          config,
          CouchUrls.design(
            config,
            designName,
            designTypeName,
            designType,
            options
          ),

        ).fetch();

      }),

      mergeAll(),
      take(1)
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
          this.saveDocument(document).subscribe((doc) => {
            document._rev = doc.rev;
            document._id = doc.id;
            observer.next(this.documents.doc(<CouchDBDocument>document));
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

  public session(): Observable<CouchDBSession> {
    return Observable.create((observer: Observer<CouchDBSession>) => {
      this.config().pipe(take(1)).subscribe((config: WatcherConfig) => {
        this.httpRequest<HttpResponseWithHeaders<CouchDBSession>>(
          config,
          CouchUrls.session(config),
          FetchBehavior.simpleWithHeaders
        ).fetch().pipe(
          tap(this.saveCookie),
          map(this.extractResponse)
        ).subscribe(
          (response: CouchDBSession) => {
            if(!this.loginAttemptMade.value) {
              this.loginAttemptMade.next(true);
            }

            if (response.ok && response.info.authenticated) {
              this.context.next(response.userCtx);

              if (!this.authenticated.value) {
                this.authenticated.next(true);
              }

            } else {
              this.context.next(null);

              if (!!this.authenticated.value) {
                this.authenticated.next(false);
              }

            }

            observer.next(response);
          },

          (err: any) => {
            observer.error(err);
          },

          // () => { this.loginAttemptMade.next(true); } // todo see if this could replace above call.
          // not sure that this would actuallt work or not. If not, should be easy to add to rxhttp
        );

      });

    });

  }

  public destroySession() {
    return Observable.create((observer: Observer<CouchDBBasicResponse>) => {
      this.config().pipe(take(1)).subscribe((config: WatcherConfig) => {
        this.httpRequest<CouchDBBasicResponse>(
          config,
          CouchUrls.session(config),
          FetchBehavior.simple,
          'delete'
        ).fetch().subscribe((response: CouchDBBasicResponse) => {
          if (response.ok) {
            this.authenticated.next(false);
            this.cookie.next(null);
            this.documents.clear();
          }

          observer.next(response);
        });

      });

    });

  }

  public saveCookie = (httpResponse: HttpResponseWithHeaders<any>) => { // todo: this should probably be private
    const { headers } = httpResponse;
    if (typeof process === 'object') {
      const cookie = headers.get('set-cookie');
      if (cookie) {
        this.cookie.next(cookie);
      }

    }

  }

  private extractResponse(httpResponse: HttpResponseWithHeaders<any>): any {
    return httpResponse.response;
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
    });

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

  private attemptNewAuthentication(
    username: string,
    password: string
  ): Observable<CouchDBAuthenticationResponse> {
    return this.config().pipe(
      take(1),
      map((config: WatcherConfig) => {
        return this.httpRequest<HttpResponseWithHeaders<CouchDBAuthenticationResponse>>(
          config,
          CouchUrls.authenticate(config),
          FetchBehavior.simpleWithHeaders,
          'POST',
          JSON.stringify({
            'username': username,
            'password': password
          })

        ).fetch().pipe(
          tap(this.saveCookie),
          map(this.extractResponse),
          tap((_response) => {
            this.loginAttemptMade.next(true);
          })

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
          tap(this.saveCookie),
          map(this.extractResponse)) :
        httpRequest.fetch()
      ).subscribe((response: T) => {
        observer.next(of(response));
      },

      (errorMessage: ServerErrorResponse) => {
        if (errorMessage.errorCode === 401 || errorMessage.errorCode === 403) {
          this.authenticated.next(false);
          this.cookie.next(null);
          this.authenticate().subscribe(
            (authResponse: boolean) => {
              if (authResponse) {
                this.config().pipe(take(1)).subscribe((config: WatcherConfig) => {
                  observer.next(
                    this.httpRequestWithAuthRetry<T>(
                      config,
                      url,
                      behavior,
                      method,
                      body
                    )

                  );

                });

              } else {
                observer.error(errorMessage);
              }

            },

            (error) => {
              observer.error(error);
            });

          } else {
            observer.error(errorMessage);
          }

        },

        () => {
          observer.complete();
        }

      );

    }).pipe(mergeAll());

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
          this.doc(changedDoc).subscribe((_e: any) => { });
        }

      });

    }

  }

}
