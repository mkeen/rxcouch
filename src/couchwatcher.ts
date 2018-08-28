import { Observable, BehaviorSubject, combineLatest, Observer } from 'rxjs';
import { take, map, filter, distinctUntilChanged, debounceTime, mergeAll } from 'rxjs/operators';
import { HttpRequest } from '@mkeen/rxhttp';
import { CouchDBDocumentCollection } from './couchdbdocumentcollection';

import {
  CouchDBChanges,
  CouchDBChange,
  CouchDBDesignViewResponse,
  CouchDBDocument,
  CouchDBDesignViewOptions,
  CouchDBDesignView,
  CouchDBDesignList,
  WatcherConfig
} from './types';

export class CouchWatcher {
  public documents: CouchDBDocumentCollection = new CouchDBDocumentCollection();
  private database_name: BehaviorSubject<string>;
  private host: BehaviorSubject<string>;
  private port: BehaviorSubject<number>;
  private connection: any;

  constructor(host: string, port: number, database_name: string) {
    this.database_name = new BehaviorSubject(database_name);
    this.port = new BehaviorSubject(port);
    this.host = new BehaviorSubject(host);

    this.config()
      .pipe(distinctUntilChanged((a, b) => JSON.stringify(a) !== JSON.stringify(b)))
      .pipe(filter((config: WatcherConfig) => config[0].length !== 0))
      .pipe(debounceTime(1000))
      .subscribe((config: WatcherConfig) => {
        if (this.connection !== undefined) {
          this.connection.cancel().subscribe((_x: any) => { }, (_e: any) => { }, () => {
            this.connection.configure(
              this.watchUrlFromConfig(config), {
                method: 'POST',
                body: JSON.stringify({
                  'doc_ids': config[0]
                })

              });

          });

        } else {
          this.connection = new HttpRequest<CouchDBChanges>(
            this.watchUrlFromConfig(config), {
              method: 'POST',
              body: JSON.stringify({
                'doc_ids': config[0]
              })

            });

        }

        this.connection.listen().subscribe(
          (update: CouchDBChanges) => {
            return this.documents.doc(update.doc);
          }

        );

      });

  }

  public design(
    designName: string,
    designType: CouchDBDesignView | CouchDBDesignList,
    designTypeName: string,
    options?: CouchDBDesignViewOptions): Observable<any> {

    return this.config()
      .pipe(take(1))
      .pipe(map((config: WatcherConfig) => {
        return (new HttpRequest<any>(
          this.designUrlFromConfig(
            config, designName, designTypeName, designType, options), { method: 'GET' }
        )).send();
      }))
      .pipe(mergeAll())
  }

  public docId(documentId: string): BehaviorSubject<CouchDBDocument> {
    return this.doc({ _id: documentId });
  }

  public doc(document: CouchDBDocument): BehaviorSubject<CouchDBDocument> {
    return Observable
      .create((observer: Observer<BehaviorSubject<CouchDBDocument>>): void => {
        if (this.documents.hasId(document._id)) {
          observer.next(this.documents.doc(document));
          observer.complete();
        } else {
          this.config()
            .pipe(take(1))
            .pipe(map((config: WatcherConfig) => {
              return (new HttpRequest<CouchDBDocument>(
                this.singleDocumentFromConfig(config, document._id), {
                  method: 'GET'
                }
              )).send();
            }))
            .pipe(mergeAll())
            .subscribe((document: CouchDBDocument) => {
              observer.next(this.documents.doc(document));
              observer.complete();
            });
        }

      })
      .pipe(mergeAll());
  }

  private config(): Observable<WatcherConfig> {
    return combineLatest(this.documents.ids, this.database_name, this.host, this.port)
  }

  private changeOptions(): string {
    return '_changes?include_docs=true&feed=continuous&filter=_doc_ids&since=now';
  }

  private designUrlFromConfig(config: WatcherConfig, designName: string, designTypeName: string, designType: string = 'view', options?: any): string {
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

  private singleDocumentFromConfig(config: WatcherConfig, id: string): string {
    return `${this.urlPrefixFromConfig(config)}/${id}`;
  }

  private urlPrefixFromConfig(config: [string[], string, string, number]): string {
    return `http://${config[2]}:${config[3]}/${config[1]}`
  }

  private watchUrlFromConfig(config: WatcherConfig): string {
    return `${this.urlPrefixFromConfig(config)}/${this.changeOptions()}`;
  }

}
