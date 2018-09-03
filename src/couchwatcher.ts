import { distinctUntilChanged, debounceTime, take, map, filter, mergeAll, tap } from 'rxjs/operators';
import { Observer, Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { HttpRequest, FetchBehavior } from '@mkeen/rxhttp';
import { HttpRequestOptions } from '@mkeen/rxhttp/dist/types';

import {
  CouchDBChanges,
  CouchDBChange,
  CouchDBDesignViewResponse,
  CouchDBDocument,
  CouchDBDesignViewOptions,
  CouchDBDesignView,
  CouchDBDesignList,
  WatcherConfig,
  CouchDBPreDocument
} from './types';

import { CouchDBDocumentCollection } from './couchdbdocumentcollection';

export class CouchWatcher {
  public documents: CouchDBDocumentCollection = new CouchDBDocumentCollection();
  private database_name: BehaviorSubject<string>;
  private host: BehaviorSubject<string>;
  private port: BehaviorSubject<number>;
  private changeFeedReq: HttpRequest<any> | null = null;
  private configWatcher: any;

  constructor(host: string, port: number, database_name: string) {
    this.database_name = new BehaviorSubject(database_name);
    this.port = new BehaviorSubject(port);
    this.host = new BehaviorSubject(host);

    this.configWatcher = this.config()
      .pipe(distinctUntilChanged())
      .pipe(filter((config: WatcherConfig) => {
        const idsEmpty = config[0].length === 0;
        if (idsEmpty) {
          if (this.changeFeedReq instanceof HttpRequest) {
            this.changeFeedReq.disconnect();
          }

        }

        return !idsEmpty;
      }))
      .subscribe((config: WatcherConfig) => {
        const requestUrl = this.watchUrlFromConfig(config);
        const requestConfig = {
          method: 'POST',
          body: JSON.stringify({
            'doc_ids': config[0]
          })

        }

        if (this.changeFeedReq === null) {
          this.changeFeedReq = new HttpRequest<CouchDBChanges>(requestUrl, requestConfig, FetchBehavior.stream);
        } else {
          this.changeFeedReq.reconfigure(requestUrl, requestConfig, FetchBehavior.stream);
        }

        this.changeFeedReq.send(
          FetchBehavior.stream
        ).subscribe(
          (update: CouchDBChanges) => {
            return this.documents.doc(update.doc).pipe(take(1)).subscribe(() => { });
          }

        );

      });

  }

  public config(): Observable<WatcherConfig> {
    return combineLatest(
      this.documents.ids,
      this.database_name,
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
      .pipe(
        take(1),
        map((config: WatcherConfig) => {
          return (new HttpRequest<any>(
            this.designUrlFromConfig(
              config,
              designName,
              designTypeName,
              designType,
              options
            ), {
              method: 'GET'
            }

          )).send();

        }),

        mergeAll(),
        take(1));
  }

  public doc(document: CouchDBDocument | CouchDBPreDocument | string): BehaviorSubject<CouchDBDocument> {
    return Observable
      .create((observer: Observer<BehaviorSubject<CouchDBDocument>>): void => {
        if (typeof (document) === 'string') {
          document = { _id: document };
        }

        if (this.documents.isDocument(document) && this.documents.hasId(document._id)) {
          observer.next(this.documents.doc(document));
          observer.complete();
        } else {
          this.config()
            .pipe(
              take(1),
              map(
                (config: WatcherConfig) => {
                  let httpOptions: HttpRequestOptions = {
                    method: (this.documents.isDocument(document)) ? 'GET' : 'POST',
                  }

                  if (!this.documents.isDocument(document)) {
                    httpOptions.body = JSON.stringify(document);
                  }

                  return (new HttpRequest<CouchDBDocument>(
                    this.singleDocumentFromConfig(
                      config,
                      (this.documents.isDocument(document)) ? document._id : undefined
                    ), httpOptions)).send()
                }),

              mergeAll()
            )
            .pipe(
              map((doc): CouchDBDocument => {
                if (doc._id === undefined) {
                  return Object.assign(document, { _id: doc.id });
                } else {
                  return doc;
                }

              }))
            .subscribe((doc: CouchDBDocument) => {
              observer.next(this.documents.doc(doc));
              observer.complete();
            });

        }

      }).pipe(
        mergeAll()
      );
  }

  private designUrlFromConfig(
    config: WatcherConfig,
    designName: string,
    designTypeName: string,
    designType: string = 'view',
    options?: any
  ): string {
    let base = `${this.urlPrefixFromConfig(config)}/_design/${designName}/_${designType}/${designTypeName}`;
    if (options) {
      base += '?'
      for (let name in options) {
        if (options.hasOwnProperty(name)) {
          base += `${name}=${options[name]}&`
        }

      }

      base = base.substring(0, base.length - 1);
    }

    return base;
  }

  private changeOptions(): string {
    return '_changes?include_docs=true&feed=continuous&filter=_doc_ids&since=now';
  }

  private singleDocumentFromConfig(config: WatcherConfig, docId?: string): string {
    let url = `${this.urlPrefixFromConfig(config)}`;
    if (docId) {
      url += `/${docId}`;
    }

    return url;
  }

  private urlPrefixFromConfig(config: WatcherConfig): string {
    return `http://${config[2]}:${config[3]}/${config[1]}`
  }

  private watchUrlFromConfig(config: WatcherConfig): string {
    return `${this.urlPrefixFromConfig(config)}/${this.changeOptions()}`;
  }

}
