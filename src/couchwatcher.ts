import { Observable, BehaviorSubject, combineLatest, Observer } from 'rxjs';
import { take, map, filter, distinctUntilChanged, debounceTime, mergeAll } from 'rxjs/operators';

import { HttpRequest } from '@mkeen/rxhttp';

import { CouchDBDocumentCollection } from './couchdbdocumentcollection';
import {
  CouchDBChanges,
  CouchDBChange,
  CouchDBDesignView,
  CouchDBDocument
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
      .pipe(filter((config: [string[], string, string, number]) => config[0].length !== 0))
      .pipe(debounceTime(1000))
      .subscribe((config: [string[], string, string, number]) => {
        if (this.connection !== undefined) {
          this.connection.cancel().subscribe((_x: any) => { }, (_e: any) => { }, () => {
            this.connection.configure(
              this.watchUrlFromConfig(config), {
                method: 'POST',
                body: JSON.stringify({
                  'doc_ids': config[0]
                })

              }

            );

          });

        } else {
          this.connection = new HttpRequest<CouchDBChanges>(
            this.watchUrlFromConfig(config), {
              method: 'POST',
              body: JSON.stringify({
                'doc_ids': config[0]
              })

            }

          );

        }

        this.connection.listen().subscribe(
          (update: CouchDBChanges) => {
            return this.documents.set(update.doc);
          }

        );

      });

  }

  public view(designName: string, viewName: string): Observable<any> {
    return this.config()
      .pipe(take(1))
      .pipe(map((config: [string[], string, string, number]) => {
        return (new HttpRequest<any>(
          this.viewUrlFromConfig(config, designName, viewName), {
            method: 'GET'
          }

        )).send();
      }))
      .pipe(mergeAll())
  }

  public get(id: string) {
    return Observable
      .create((observer: Observer<BehaviorSubject<any>>) => {
        const doc = this.documents.get(id);
        if (doc !== null) {
          observer.next(doc);
        } else {
          this.config()
            .pipe(map((config: [string[], string, string, number]) => {
              return (new HttpRequest<any>(
                this.singleDocumentFromConfig(config, id), {
                  method: 'GET'
                }

              )).send();
            }))
            .pipe(mergeAll())
            .pipe((document: any) => {
              return this.documents.add(document);
            })
            .pipe(mergeAll());
        }

      });
  }

  private config(): Observable<[string[], string, string, number]> {
    return combineLatest(this.documents.ids, this.database_name, this.host, this.port)
  }

  private watchUrlFromConfig(config: [string[], string, string, number]): string {
    return `${this.urlPrefixFromConfig(config)}/${this.changeOptions()}`;
  }

  private singleDocumentFromConfig(config: [string[], string, string, number], id: string): string {
    return `${this.urlPrefixFromConfig(config)}/${id}`;
  }

  private viewUrlFromConfig(config: [string[], string, string, number], designName: string, viewName: string): string {
    return `${this.urlPrefixFromConfig(config)}/_design/${designName}/_view/${viewName}`;
  }

  private changeOptions(): string {
    return '_changes?include_docs=true&feed=continuous&filter=_doc_ids';
  }

  private urlPrefixFromConfig(config: [string[], string, string, number]): string {
    return `http://${config[2]}:${config[3]}/${config[1]}`
  }

}
