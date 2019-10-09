import { Observer, Observable, Subject, BehaviorSubject, combineLatest, of } from 'rxjs';
import { distinctUntilChanged, take, map, filter, mergeAll, tap, skip, takeUntil, debounceTime, catchError } from 'rxjs/operators';

import {
  FetchBehavior,
  HttpRequest,
  HttpRequestOptions,
  HttpResponseWithHeaders,
  ServerErrorResponse
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
  CouchDBSessionEnvelope
} from './types';

import {
  IDS,
  COOKIE,
  TRACK_CHANGES,
  AUTHENTICATED
} from './enums';

import { CouchDBDocumentCollection } from './couchdbdocumentcollection';

export class CouchDB {
  public documents: CouchDBDocumentCollection = new CouchDBDocumentCollection();
  public authenticated: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public userSession: BehaviorSubject<CouchDBSession | null> = new BehaviorSubject<CouchDBSession | null>(null)
  private databaseName: BehaviorSubject<string>;
  private host: BehaviorSubject<string>;
  private port: BehaviorSubject<number>;
  private ssl: BehaviorSubject<boolean>;
  private cookie: BehaviorSubject<string>;
  private trackChanges: BehaviorSubject<boolean>;
  private appDocChanges: CouchDBAppChangesSubscriptions = {};
  private changeFeedHttpRequest: HttpRequest<CouchDBChanges> | null = null;
  private changeFeedAbort: Subject<boolean> = new Subject();

  constructor(
    rxCouchConfig: RxCouchConfig,
    public auth: AuthorizationBehavior = AuthorizationBehavior.open,
    public credentials: Observable<CouchDBCredentials> | null = null
  ) {
    this.databaseName = new BehaviorSubject<string>(rxCouchConfig.dbName);
    this.port = new BehaviorSubject<number>(rxCouchConfig.port || 5984);
    this.host = new BehaviorSubject<string>(rxCouchConfig.host || '127.0.0.1');
    this.ssl = new BehaviorSubject<boolean>(rxCouchConfig.ssl ? true : false);
    this.cookie = new BehaviorSubject<string>(rxCouchConfig.cookie || '');
    this.trackChanges = new BehaviorSubject<boolean>(rxCouchConfig.trackChanges === undefined ? true : rxCouchConfig.trackChanges);

    if (this.credentials) {
      this.credentials.subscribe((_couchDbCreds: CouchDBCredentials) => {
        this.authenticate()
          .subscribe(
            (authResponse: HttpResponseWithHeaders<CouchDBAuthenticationResponse>) => {
              if (authResponse.response.ok) {
                this.authenticated.next(true);
              }

            });

      });

    }

    this.config()
      .pipe(distinctUntilChanged(),
        filter((config: WatcherConfig) => {
          console.log("config changed", config);
          const idsEmpty = config[IDS].length === 0;
          if (idsEmpty || config[TRACK_CHANGES] === false) {
            if (this.changeFeedHttpRequest) {
              this.changeFeedHttpRequest.cancel();
            }

            this.changeFeedAbort.next(true);
          }

          return !(idsEmpty || !config[TRACK_CHANGES] || !config[AUTHENTICATED]);
        }),

        debounceTime(0)).subscribe((config: WatcherConfig) => {
          this.configureChangeFeed(config);
        });

  }

  public authenticate(): Observable<HttpResponseWithHeaders<CouchDBAuthenticationResponse>> {
    if (this.auth === AuthorizationBehavior.cookie && this.credentials !== null) {
      return this.credentials
        .pipe(map((credentials: CouchDBCredentials) => {
          return this.attemptNewAuthentication(credentials.username, credentials.password)
            .pipe(
              tap((authResponse: any) => {
                console.log("attempting login");
                if (typeof process === 'object') {
                  const cookie = authResponse.headers.get('set-cookie');
                  if (cookie) {
                    this.cookie.next(cookie);
                  }

                }

                this.authenticated.next(authResponse.response.error === undefined);
              }))

        }), mergeAll());

    } else {
      this.authenticated.next(true);
      return of({ headers: new Headers(), response: { ok: true, roles: [], name: '' } }); // Maybe a more suitable value here would be "null"
    }

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
    ).pipe(takeUntil(this.changeFeedAbort))
      .subscribe(
        (update: CouchDBChanges) => {
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
    return this.config()
      .pipe(take(1),
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
        take(1));
  }

  public doc(document: CouchDBDocument | CouchDBPreDocument | string): BehaviorSubject<CouchDBDocument> {
    return Observable
      .create((observer: Observer<BehaviorSubject<CouchDBDocument>>): void => {
        if (typeof (document) === 'string') {
          if (this.documents.isKnownDocument(document)) {
            observer.next(this.documents.doc(document));
            this.listenForLocalChanges(document);
          } else {
            this.getDocument(document, observer)
          }

        } else {
          if (this.documents.isValidCouchDBDocument(document)) {
            if (this.documents.changed(<CouchDBDocument>document)) {
              this.saveDocument(document, observer);
              observer.next(this.documents.doc(document._id));
            } else {
              observer.next(this.documents.doc(document._id));
            }

          } else {
            this.saveDocument(document, observer);
          }

        }

      }).pipe(mergeAll());

  }

  public find(query: CouchDBFindQuery): Observable<CouchDBDocument[]> {
    return Observable
      .create((observer: Observer<CouchDBDocument[]>): void => {
        this.config()
          .pipe(
            take(1),
            map((config: WatcherConfig) => {
              return this.httpRequestWithAuthRetry<CouchDBFindResponse>(
                config,
                CouchUrls.find(config),
                FetchBehavior.simple,
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

  public getSession() {
    return Observable
      .create((observer: Observer<CouchDBSessionEnvelope>) => {
        this.config()
          .pipe(take(1))
          .subscribe((config: WatcherConfig) => {
            this.httpRequest<CouchDBSession>(config, CouchUrls.session(config), FetchBehavior.simple)
              .fetch()
              .subscribe(
                (response: CouchDBSession) => {
                  if (response.ok && response.info.authenticated) {
                    this.authenticated.next(true);
                  } else {
                    this.authenticated.next(false);
                  }

                  const next: CouchDBSessionEnvelope = { session: response };
                  if (typeof process === 'object') {
                    if (config[COOKIE] && config[COOKIE].length) {
                      next.cookie = config[COOKIE];
                    }

                  }

                  observer.next(next);
                },

                (err: any) => {
                  observer.error(err);
                });

          });

      });

  }

  public destroySession() {
    return Observable
      .create((observer: Observer<CouchDBBasicResponse>) => {
        this.config()
          .pipe(take(1))
          .subscribe((config: WatcherConfig) => {
            this.httpRequest<CouchDBBasicResponse>(config, CouchUrls.session(config), FetchBehavior.simple, 'delete')
              .fetch()
              .subscribe((response: CouchDBBasicResponse) => {
                if (response.ok) {
                  this.authenticated.next(false);
                }

                observer.next(response);
              });

          });

      });

  }

  private getDocument(
    documentId: string,
    observer: Observer<BehaviorSubject<CouchDBDocument>>
  ): void {
    this.config()
      .pipe(
        take(1),
        map(
          (config: WatcherConfig) => {
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
      )
      .subscribe((doc: any) => {
        if (this.documents.isValidCouchDBDocument(doc)) {
          observer.next(this.documents.doc(doc));
          this.listenForLocalChanges(doc._id);
        } else {
          observer.error(doc)
        }

        observer.complete();
      });

  }

  private saveDocument(
    document: CouchDBDocument | CouchDBPreDocument,
    observer: Observer<BehaviorSubject<CouchDBDocument>>
  ): void {
    this.config()
      .pipe(
        take(1),
        map(
          (config: WatcherConfig) => {
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

        mergeAll()).subscribe(
          (docRevResponse: CouchDBDocumentRevisionResponse): void => {
            if (!docRevResponse.error) {
              if (this.documents.isPreDocument(document)) {
                document._id = docRevResponse.id;
              }

              document._rev = docRevResponse.rev;
              observer.next(this.documents.doc(<CouchDBDocument>document));

              this.listenForLocalChanges(document._id);
            }

            observer.complete();
          });

  }

  private attemptNewAuthentication(
    username: string,
    password: string
  ): Observable<any> {
    return this.config()
      .pipe(
        take(1),
        map((config: WatcherConfig) => {
          return this.httpRequest<CouchDBAuthenticationResponse>(
            config,
            CouchUrls.authenticate(config),
            FetchBehavior.simpleWithHeaders,
            'POST',
            JSON.stringify({
              'username': username,
              'password': password
            })
          ).fetch();
        }));
  }

  private httpRequestWithAuthRetry<T>(
    config: WatcherConfig,
    url: string,
    behavior: FetchBehavior = FetchBehavior.simple,
    method: string = 'GET',
    body: any = undefined,
    httpRequest = this.httpRequest<T>(
      config,
      url,
      behavior,
      method,
      body
    )

  ): Observable<T> {
    return Observable
      .create((observer: Observer<any>): void => {
        httpRequest.fetch()
          .subscribe(
            (response: T) => {
              observer.next(of(response));
            },

            (errorMessage: ServerErrorResponse) => {
              if (errorMessage.errorCode === 401 || errorMessage.errorCode === 403) {
                this.authenticated.next(false);
                this.cookie.next('');

                this.authenticate()
                  .subscribe((authResponse: HttpResponseWithHeaders<CouchDBAuthenticationResponse>) => {
                    // Need to handle failure here somehow
                    if (authResponse.response.ok) {
                      this.config()
                        .pipe(take(1))
                        .subscribe((config: WatcherConfig) => {
                          observer.next(
                            this.httpRequestWithAuthRetry<T>(
                              config,
                              url,
                              behavior,
                              method,
                              body
                            )

                          );

                        })

                    } else {
                      observer.error(errorMessage);
                    }

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
    behavior: FetchBehavior = FetchBehavior.simple,
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

    if (config[COOKIE].length > 0 && typeof process === 'object') {
      httpOptions['headers'] = {
        'Cookie': this.cookieForRequestHeader(config[COOKIE])
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
    if (this.appDocChanges[doc_id] === undefined) {
      this.appDocChanges[doc_id] = this.documents.doc(doc_id)
        .pipe(skip(1))
        .subscribe((changedDoc: any) => {
          if (doc_id !== changedDoc._id) {
            console.warn('document mismatch. change ignored.');
            return;
          }

          if (this.documents.changed(changedDoc)) {
            this.stopListeningForLocalChanges(changedDoc._id);
            this.doc(changedDoc).subscribe((_e: any) => { });
          }

        });

    }

  }

}
