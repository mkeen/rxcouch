import { Observer, Observable, BehaviorSubject, combineLatest } from "rxjs";
import { distinctUntilChanged, take, map, filter, mergeAll } from "rxjs/operators";

import { FetchBehavior, HttpRequest, HttpRequestOptions } from "@mkeen/rxhttp";

import { CouchUrls } from "./couchurls";

import {
  CouchDBChanges, CouchDBDocument, CouchDBDesignViewOptions, CouchDBDesignView,
  CouchDBDesignList, WatcherConfig, CouchDBPreDocument, CouchDBAppChangesSubscriptions
} from "./types";

import { CouchDBDocumentCollection } from "./couchdbdocumentcollection";

export class CouchDB {
  public documents: CouchDBDocumentCollection = new CouchDBDocumentCollection();
  private database_name: BehaviorSubject<string>;
  private host: BehaviorSubject<string>;
  private port: BehaviorSubject<number>;
  private headers: BehaviorSubject<any>;
  private changeFeedReq: HttpRequest<any> | null = null;
  private configWatcher: any;
  private appDocChanges: CouchDBAppChangesSubscriptions = {};
  private changeFeedSubscription: any;

  constructor(
    host: string,
    database_name: string,
    port: number = 5984,
    headers?: any
  ) {
    this.database_name = new BehaviorSubject(database_name);
    this.port = new BehaviorSubject(port);
    this.host = new BehaviorSubject(host);
    this.headers = new BehaviorSubject(headers);

    this.configWatcher = this.config()
      .pipe(distinctUntilChanged())
      .pipe(
        filter((config: WatcherConfig) => {
          const idsEmpty = config[0].length === 0;
          if (idsEmpty) {
            if (this.changeFeedReq instanceof HttpRequest) {
              this.changeFeedReq.disconnect();
            }
          }

          return !idsEmpty;
        })
      )
      .subscribe((config: WatcherConfig) => {
        const requestUrl = CouchUrls.watch(config);
        const requestConfig = {
          method: "POST",
          body: JSON.stringify({
            doc_ids: config[0]
          }),
          headers: {
            "Content-Type": "application/json",
            ...this.headers.value
          }
        };

        if (this.changeFeedReq === null) {
          this.changeFeedReq = new HttpRequest<CouchDBChanges>(
            requestUrl,
            requestConfig,
            FetchBehavior.stream
          );
        } else {
          this.changeFeedReq.reconfigure(
            requestUrl,
            requestConfig,
            FetchBehavior.stream
          );
        }

        if (this.changeFeedSubscription) {
          this.changeFeedSubscription.unsubscribe();
        }

        this.changeFeedSubscription = this.changeFeedReq
          .fetch()
          .subscribe((update: CouchDBChanges) => {
            if (this.documents.changed(update.doc)) {
              return this.documents
                .doc(update.doc)
                .pipe(take(1))
                .subscribe();
            }
          },
            (err) => {
              console.log(err),
                () => { console.log("feed has completed") }
            });
      });
  }

  public config(): Observable<WatcherConfig> {
    return combineLatest(
      this.documents.ids,
      this.database_name,
      this.host,
      this.port,
      this.headers
    );
  }

  public design(
    designName: string,
    designType: CouchDBDesignView | CouchDBDesignList,
    designTypeName: string,
    options?: CouchDBDesignViewOptions
  ): Observable<any> {
    return this.config().pipe(
      take(1),
      map((config: WatcherConfig) => {
        return new HttpRequest<any>(
          CouchUrls.design(
            config,
            designName,
            designTypeName,
            designType,
            options
          ),
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              ...this.headers.value
            }
          }
        ).fetch();
      }),

      mergeAll(),
      take(1)
    );
  }

  public doc(
    document: CouchDBDocument | CouchDBPreDocument | string
  ): BehaviorSubject<CouchDBDocument> {
    return Observable.create(
      (observer: Observer<BehaviorSubject<CouchDBDocument>>): void => {
        if (typeof document === "string") {
          if (this.documents.hasId(document)) {
            observer.next(this.documents.doc(document));
            observer.complete();
            return;
          } else {
            document = { _id: document };
          }
        }

        if (
          this.documents.isDocument(document) &&
          this.documents.hasId(document._id)
        ) {
          if (this.documents.changed(document)) {
            this.config()
              .pipe(
                take(1),
                map((config: WatcherConfig) => {
                  let httpOptions: HttpRequestOptions = {
                    method: "PUT",
                    body: JSON.stringify(document),
                    headers: {
                      "Content-Type": "application/json",
                      ...this.headers.value
                    }
                  };

                  return new HttpRequest<CouchDBDocument>(
                    CouchUrls.document(config, (<CouchDBDocument>document)._id),
                    httpOptions
                  )
                    .fetch()
                    .pipe(
                      map(_d => {
                        (<CouchDBDocument>document)._rev = _d.rev;
                        this.documents.snapshot(<CouchDBDocument>document);
                        return <CouchDBDocument>document;
                      })
                    );
                }),

                mergeAll()
              )
              .subscribe((doc: CouchDBDocument) => {
                observer.next(this.documents.doc(doc._id));
                observer.complete();
              });
          } else {
            observer.next(this.documents.doc(<CouchDBDocument>document));
            observer.complete();
          }
        } else {
          this.config()
            .pipe(
              take(1),
              map((config: WatcherConfig) => {
                let httpOptions: HttpRequestOptions = {
                  method: !this.documents.isPreDocument(document)
                    ? "GET"
                    : "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...this.headers.value
                  }
                };

                if (this.documents.isPreDocument(document)) {
                  httpOptions.body = JSON.stringify(document);
                }

                return new HttpRequest<CouchDBDocument>(
                  CouchUrls.document(
                    config,
                    !this.documents.isPreDocument(document)
                      ? (<CouchDBDocument>document)._id
                      : undefined
                  ),
                  httpOptions
                ).fetch();
              }),

              mergeAll()
            )
            .subscribe((doc: CouchDBDocument) => {
              const Document = this.documents.doc(doc);
              if (this.appDocChanges[doc._id] === undefined) {
                if (this.documents.changed(doc)) {
                  this.documents.snapshot(doc);
                }

                this.appDocChanges[doc._id] = Document.subscribe(changedDoc => {
                  if (this.documents.changed(changedDoc)) {
                    console.log(
                      "if we got here, there's more work to do",
                      changedDoc
                    );
                  }
                });
              }

              observer.next(Document);
              observer.complete();
            });
        }
      }
    ).pipe(mergeAll());
  }
}
