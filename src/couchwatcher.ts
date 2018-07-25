import { Observable, BehaviorSubject, combineLatest, Subject, Observer } from 'rxjs';
import { take, flatMap, map, filter, mergeAll, takeUntil } from 'rxjs/operators';
import { HttpRequest } from '@mkeen/rxhttp';

interface CouchDBChange {
  rev: string;
}

interface CouchDBChanges {
  changes: CouchDBChange[];
  id: string;
  seq: string;
  doc: CouchDBDocument;
}

interface CouchDBDocument {
  "_id": string;
}

interface CouchDBDesignView {
  total_rows: number;
  offset: number;
  rows: CouchDBDocument[];
}

class CouchDBDocumentCollection {
  private documents: any = {};
  public ids: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);

  public add(document: CouchDBDocument) {
    this.documents[document._id] = new BehaviorSubject<CouchDBDocument>(document);
    this.ids
      .pipe(take(1))
      .subscribe((ids) => {
        ids.push(document._id);
        this.ids.next(ids)
      });

    return this.documents[document._id];
  }

  public get(id: string): BehaviorSubject<CouchDBDocument> {
    return this.documents[id];
  }

  public set(document: any): BehaviorSubject<CouchDBDocument> {
    const doc = this.get(document['_id']);
    if (doc !== undefined) {
      doc.next(document);
      return doc;
    } else {
      return this.add(document);
    }

  }

}

export class CouchWatcher {
  private document_ids: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);
  private database_name: BehaviorSubject<string> = new BehaviorSubject<string>('');
  private host: BehaviorSubject<string> = new BehaviorSubject<string>('127.0.0.1');
  private port: BehaviorSubject<number> = new BehaviorSubject<number>(5984);
  public documents: CouchDBDocumentCollection = new CouchDBDocumentCollection();
  private connection: any;

  constructor(host: string, port: number, database_name: string) {
    this.database_name.next(database_name);
    this.port.next(port);
    this.host.next(host);

    this.documents.ids
      .pipe(filter(ids => ids !== null))
      .subscribe(ids => this.document_ids.next(ids));

    this.config()
      .subscribe((config: [string[], string, string, number]) => {
        if (this.connection) {
          this.connection.cancel().subscribe(() => {
            this.createDocuments(config[0]);
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
            console.log("update", update);
            return this.documents.set(update.doc)
          }

        );

      });

  }

  private createDocuments(document_ids: string[]) {
    document_ids.forEach((document_id: string) => {
      if (!this.documents.get(document_id)) {
        this.documents.set({ '_id': document_id });
      }

    });
  }

  public view(designName: string, viewName: string): Observable<any> {
    console.log("view");
    return this.config()
      .pipe(take(1))
      .pipe(map((config: [string[], string, string, number]) => {
        return (new HttpRequest<any>(
          this.viewUrlFromConfig(config, designName, viewName), {
            method: 'GET'
          }

        )).get();
      }))
  }

  private config(): Observable<[string[], string, string, number]> {
    return combineLatest(this.document_ids, this.database_name, this.host, this.port)
  }

  private watchUrlFromConfig(config: [string[], string, string, number]): string {
    return `${this.urlPrefixFromConfig(config)}/${this.changeOptions()}`;
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
