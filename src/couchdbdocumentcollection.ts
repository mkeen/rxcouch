import { BehaviorSubject, Observable, Observer } from 'rxjs';
import { take, mergeAll } from 'rxjs/operators';
import { CouchDBDocument } from './types';

export class CouchDBDocumentCollection {
  private documents: any = {};
  public ids: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);

  public doc(document: any): BehaviorSubject<CouchDBDocument> {
    const doc = this.find(document['_id']);
    if (doc !== null) {
      if (!this.isFragment(document)) {
        doc.next(document);
      }

      return doc;
    } else {
      return this.add(document);
    }

  }

  public clear() {
    this.documents = {};
    this.ids.next([]);
  }

  public docId(document_id: string): BehaviorSubject<CouchDBDocument> {
    return this.doc({ _id: document_id });
  }

  public hasId(document_id: string): boolean {
    return this.find(document_id) !== null
  }

  private add(document: CouchDBDocument): BehaviorSubject<CouchDBDocument> {
    return Observable
      .create((observer: Observer<BehaviorSubject<CouchDBDocument>>): void => {
        this.ids
          .pipe(take(1))
          .subscribe((ids: string[]): void => {
            ids.push(document._id);
            this.ids.next(ids);
            this.documents[document._id] = new BehaviorSubject<CouchDBDocument>(document);
            observer.next(this.documents[document._id]);
            observer.complete();
          })
      })
      .pipe(mergeAll());
  }

  private find(document_id: string): BehaviorSubject<CouchDBDocument> | null {
    if (this.documents[document_id] === undefined) {
      return null;
    } else {
      return this.documents[document_id];
    }

  }

  private isFragment(document: CouchDBDocument): boolean {
    return Object.keys(document).length === 1;
  }

}
