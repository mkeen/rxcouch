import { BehaviorSubject, Observable, Observer } from 'rxjs';
import { take, mergeAll } from 'rxjs/operators';
import { CouchDBBatch } from './couchdbbatch';
import { CouchDBDocument } from './types';

export class CouchDBDocumentCollection {
  private documents: any = {};
  public ids: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);

  public clear() {
    this.documents = {};
    this.ids.next([]);
  }

  public doc(document: CouchDBDocument): BehaviorSubject<CouchDBDocument> {
    const savedDoc: BehaviorSubject<CouchDBDocument> | null = this.find(document['_id']);

    if (savedDoc !== null) {
      if (!this.isFragment(document)) {
        savedDoc.next(document);
      }

      return savedDoc;
    } else {
      return this.add(document);
    }

  }

  public hasId(document_id: string): boolean {
    return this.find(document_id) !== null
  }

  public isFragment(document: CouchDBDocument): boolean {
    return Object.keys(document).length === 1;
  }

  private add(document: CouchDBDocument): BehaviorSubject<CouchDBDocument> {
    return Observable
      .create((observer: Observer<BehaviorSubject<CouchDBDocument>>): void => {
        this.ids
          .pipe(take(1))
          .subscribe((ids: string[]): void => {
            this.ids.next(ids.concat([document._id]));
            this.documents[document._id] = new BehaviorSubject<CouchDBDocument>(document);
            observer.next(this.documents[document._id]);
            observer.complete();
          });

      }).pipe(mergeAll());
  }

  private find(document_id: string): BehaviorSubject<CouchDBDocument> | null {
    if (this.documents[document_id] === undefined) {
      return null;
    } else {
      return this.documents[document_id];
    }

  }

}
