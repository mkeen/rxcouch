import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
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

class CouchDBDocumentCollection {
  private documents: any = {};

  public add(document: CouchDBDocument) {
    return this.documents[document._id] = new BehaviorSubject<CouchDBDocument>(document);
  }

  public get(id: string): BehaviorSubject<CouchDBDocument> {
    return this.documents[id];
  }

  public set(document: CouchDBDocument): BehaviorSubject<CouchDBDocument> {
    const doc = this.get(document._id);
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
  private watch: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  public documents: CouchDBDocumentCollection = new CouchDBDocumentCollection();
  private connection: any;

  constructor(host: string, port: number, database_name: string, document_ids: string[] = [], watch: boolean = true) {
    this.document_ids.next(document_ids);
    this.database_name.next(database_name);
    this.port.next(port);
    this.host.next(host);
    this.watch.next(watch);

    combineLatest(this.document_ids, this.database_name, this.host, this.port, this.watch)
      .subscribe((config: any[]) => {
        if (this.connection) {
          this.connection.cancel();
        }

        config[0].forEach((document_id: string) => {
          this.documents.set({ '_id': document_id });
        });

        if (config[4]) {
          this.connection = new HttpRequest<CouchDBChanges>(
            this.urlFromConfig(config), {
              method: 'POST',
              body: JSON.stringify({
                'doc_ids': config[0]
              })

            }

          );

          this.connection.send().subscribe(
            (update: CouchDBChanges) => this.documents.set(update.doc)
          );

        }

      });

  }

  private changeOptions(): string {
    return '_changes?include_docs=true&feed=continuous&filter=_doc_ids';
  }

  private urlFromConfig(config: any): string {
    return `http://${config[2]}:${config[3]}/${config[1]}/${this.changeOptions()}`;
  }

}
