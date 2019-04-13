import { Observer, Observable, Subject, BehaviorSubject, combineLatest, Subscription, EMPTY, observable } from 'rxjs';
import { distinctUntilChanged, take, map, filter, mergeAll, tap, skip } from 'rxjs/operators';

import {
  FetchBehavior,
  HttpRequest,
  HttpRequestOptions,
  HttpRequestHeaders
} from '@mkeen/rxhttp';

import { CouchUrls } from './couchurls';

import {
  CouchDBAuthenticationStrategy,
  CouchDBOpenAuthenticationStrategy
} from './couchdbauthenticationstrategy';

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
  CouchDBAuthenticationResponse
} from './types';

import {
  IDS,
  DATABASE_NAME,
  HOST,
  PORT
} from './enums';

import { CouchDBDocumentCollection } from './couchdbdocumentcollection';

export class CouchDB {
  public documents: CouchDBDocumentCollection = new CouchDBDocumentCollection();
  private changeFeedReq: HttpRequest<any> | null = null;
  private databaseName: BehaviorSubject<string>;
  private host: BehaviorSubject<string>;
  private port: BehaviorSubject<number>;
  private configWatcher: any;
  private appDocChanges: CouchDBAppChangesSubscriptions = {};
  private changeFeedSubscription: any;

  constructor(
    rxCouchConfig: RxCouchConfig,
    private auth: CouchDBAuthenticationStrategy = new CouchDBOpenAuthenticationStrategy()
  ) {
    this.databaseName = new BehaviorSubject<string>(rxCouchConfig.dbName);
    this.port = new BehaviorSubject<number>(rxCouchConfig.port || 5984);
    this.host = new BehaviorSubject<string>(rxCouchConfig.host || '127.0.0.1');

    auth.authenticate(this)
      .pipe(take(1))
      .subscribe(() => {
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

      })

  }

  public authenticate(
    username: string = '',
    password: string = '',
  ): Observable<void> {
    return Observable
      .create((observer: Observer<CouchDBAuthenticationResponse>): void => {
        this.config()
          .pipe(take(1))
          .subscribe((config: WatcherConfig) => {
            let requestConfig: HttpRequestOptions = {
              method: 'POST',
              body: JSON.stringify({
                'username': username,
                'password': password
              })

            };

            new HttpRequest<CouchDBAuthenticationResponse>(
              CouchUrls.authenticate(config, username, password),
              requestConfig, FetchBehavior.simple
            ).fetch()
              .pipe(take(1))
              .subscribe(
                (auth: CouchDBAuthenticationResponse) => observer.next(auth)
              );

          });

      });

  }

  public changeFeedConnection(config: WatcherConfig) {
    const requestUrl = CouchUrls.watch(config);
    let requestConfig: any = {
      method: 'POST',
      body: JSON.stringify({
        'doc_ids': config[IDS]
      })

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
      this.port
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

  public doc(document: CouchDBDocument | CouchDBPreDocument | string): Observable<BehaviorSubject<CouchDBDocument>> {
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

        observer.complete();
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
            let httpOptions: HttpRequestOptions = {
              method: 'GET',
            }

            return (new HttpRequest<CouchDBDocument>(
              CouchUrls.document(
                config,
                documentId,
              ), httpOptions)).fetch()
          }),

        mergeAll()
      )
      .subscribe((doc: CouchDBDocument) => {
        observer.next(this.documents.doc(doc));
        this.listenForLocalChanges(doc._id);
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
              method: 'PUT',
              body: JSON.stringify(document)
            }

            return (new HttpRequest<CouchDBDocumentRevisionResponse>(
              CouchUrls.document(
                config,
                !this.documents.isPreDocument(document) ? document._id : undefined
              ), httpOptions)).fetch()
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
        .subscribe((changedDoc) => {
          if (this.documents.changed(changedDoc)) {
            this.stopListeningForLocalChanges(changedDoc._id);
            this.doc(changedDoc).subscribe((e) => { });
          }

        });

    }

  }

}
