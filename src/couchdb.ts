import { Observer, Observable, Subject, BehaviorSubject, combineLatest, Subscription, EMPTY, observable, of } from 'rxjs';
import { distinctUntilChanged, take, switchMap, map, filter, mergeAll, mergeMap, tap, skip, catchError, merge } from 'rxjs/operators';

import {
  FetchBehavior,
  HttpRequest,
  HttpRequestOptions,
  HttpRequestHeaders
} from '@mkeen/rxhttp';

import { CouchUrls } from './couchurls';

import {
  RxCouchConfig,
  CouchDBAuthentication,
  CouchDBChanges,
  CouchDBChange,
  CouchDBDesignViewResponse,
  CouchDBDocumentRevisionResponse,
  CouchDBDocument,
  CouchDBDesignViewOptions,
  CouchDBDesignView,
  CouchDBDesignList,
  WatcherConfig,
  CouchDBPreDocument,
  CouchDBAppChangesSubscriptions,
  CouchDBHeaders,
  CouchDBAuthenticationResponse,
  CouchDBError,
  AuthorizationBehavior
} from './types';

import {
  IDS,
  DATABASE_NAME,
  HOST,
  PORT,
  SSL,
  COOKIE
} from './enums';

import { CouchDBDocumentCollection } from './couchdbdocumentcollection';

export class CouchDB {
  public documents: CouchDBDocumentCollection = new CouchDBDocumentCollection();
  public authenticated: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  private changeFeedReq: HttpRequest<any> | null = null;
  private databaseName: BehaviorSubject<string>;
  private host: BehaviorSubject<string>;
  private port: BehaviorSubject<number>;
  private ssl: BehaviorSubject<boolean>;
  private cookie: BehaviorSubject<string>;
  private configWatcher: any;
  private appDocChanges: CouchDBAppChangesSubscriptions = {};
  private changeFeedSubscription: any;

  constructor(
    rxCouchConfig: RxCouchConfig,
    public auth: AuthorizationBehavior = AuthorizationBehavior.open,
    public username?: string,
    public password?: string
  ) {
    this.databaseName = new BehaviorSubject<string>(rxCouchConfig.dbName);
    this.port = new BehaviorSubject<number>(rxCouchConfig.port || 5984);
    this.host = new BehaviorSubject<string>(rxCouchConfig.host || '127.0.0.1');
    this.ssl = new BehaviorSubject<boolean>(rxCouchConfig.ssl || false);
    this.cookie = new BehaviorSubject<string>(rxCouchConfig.cookie || '');

    this.authenticate().subscribe((_s: any) => {
      this.configWatcher = this.config()
        .pipe(distinctUntilChanged())
        .pipe(filter((config: WatcherConfig) => {
          const idsEmpty = config[IDS].length === 0;
          if (idsEmpty) {
            if (this.changeFeedReq instanceof HttpRequest) {
              this.changeFeedReq.disconnect();
            }

          }

          return !idsEmpty;
        })).subscribe((config: WatcherConfig) => {
          this.changeFeedConnection(config);
        });

    });

  }

  private _authenticate(
    username: string,
    password: string
  ): Observable<any> {
    return this.config()
      .pipe(
        take(1),
        map((config: WatcherConfig) => {
          let requestConfig: HttpRequestOptions = {
            method: 'POST',
            body: JSON.stringify({
              'username': username,
              'password': password
            })

          };

          return new HttpRequest<CouchDBAuthenticationResponse>(
            CouchUrls.authenticate(config),
            requestConfig,
            FetchBehavior.simpleWithHeaders
          ).fetch();

        }),
        mergeAll());
  }

  public authenticate(): Observable<any> {
    if (this.auth === AuthorizationBehavior.cookie) {
      if (this.username && this.password) {
        console.log("in here!");
        return this._authenticate(this.username, this.password)
          .pipe(
            tap((authResponse: any) => {
              const cookie = authResponse[1].get('set-cookie');
              if (cookie) {
                this.cookie.next(cookie.split(';')[0].trim());
              }

              this.authenticated.next(authResponse[0].error === undefined);
            }));

      } else {
        this.authenticated.next(false);
        return of({ ok: false, roles: [], name: '' });
      }

    } else {
      this.authenticated.next(true);
      return of({ ok: true, roles: [], name: '' });
    }

  }

  public changeFeedConnection(config: WatcherConfig) {
    const requestUrl = CouchUrls.watch(config);
    let requestConfig: any = {
      method: 'POST',
      body: JSON.stringify({
        'doc_ids': config[IDS]
      })

    }

    if (config[COOKIE].length > 0) {
      requestConfig['headers'] = {
        'Cookie': config[COOKIE]
      }

    }

    if (this.changeFeedReq === null) {
      this.changeFeedReq = new HttpRequest<CouchDBChanges>(requestUrl, requestConfig, FetchBehavior.stream);
    } else {
      this.changeFeedReq.reconfigure(requestUrl, requestConfig, FetchBehavior.stream);
    }

    if (this.changeFeedSubscription) {
      this.changeFeedSubscription.unsubscribe();
    }

    this.changeFeedSubscription = this.changeFeedReq.fetch()
      .subscribe(
        (update: CouchDBChanges) => {
          if (update.last_seq !== undefined) {
            this.changeFeedConnection(config);
          } else {
            if (this.documents.changed(update.doc)) {
              this.stopListeningForLocalChanges(update.doc._id);
              this.documents.doc(update.doc);
              this.listenForLocalChanges(update.doc._id);
            }

          }

        });

  }

  public config(): Observable<WatcherConfig> {
    return combineLatest(
      this.documents.ids,
      this.databaseName,
      this.host,
      this.port,
      this.ssl,
      this.cookie
    );

  }

  public design(
    designName: string,
    designType: CouchDBDesignView | CouchDBDesignList,
    designTypeName: string,
    options?: CouchDBDesignViewOptions
  ): Observable<any> {
    return this.config()
      .pipe(take(1),
        map((config: WatcherConfig) => {
          let requestConfig: HttpRequestOptions = {};

          return (new HttpRequest<any>(
            CouchUrls.design(
              config,
              designName,
              designTypeName,
              designType,
              options
            ), requestConfig
          )).fetch();

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
            } else {
              observer.next(this.documents.doc(document._id));
            }

          } else {
            this.saveDocument(document, observer);
          }

        }

      }).pipe(mergeAll());

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
            let httpOptions: HttpRequestOptions = {
              method: 'GET',
            }

            if (config[COOKIE].length > 0) {
              httpOptions['headers'] = {
                'Cookie': config[COOKIE]
              }

            }

            return (new HttpRequest<CouchDBDocument | CouchDBError>(
              CouchUrls.document(
                config,
                documentId,
              ), httpOptions)).fetch()
          }),

        mergeAll()
      )
      .subscribe((doc: any) => {
        console.log("dddd", doc);
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
            let httpOptions: HttpRequestOptions = {
              method: this.documents.isPreDocument(document) ? 'POST' : 'PUT',
              body: JSON.stringify(document)
            }

            if (config[COOKIE].length > 0) {
              httpOptions['headers'] = {
                'Cookie': config[COOKIE]
              }

            }

            return (new HttpRequest<CouchDBDocumentRevisionResponse>(
              CouchUrls.document(
                config,
                !this.documents.isPreDocument(document) ? document._id : undefined
              ), httpOptions)).fetch();

          }),

        mergeAll()
      )
      .subscribe((docRevResponse: CouchDBDocumentRevisionResponse): void => {
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
          if (this.documents.changed(changedDoc)) {
            this.stopListeningForLocalChanges(changedDoc._id);
            this.doc(changedDoc).subscribe((e: any) => { });
          }

        });

    }

  }

}
