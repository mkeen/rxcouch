import { BehaviorSubject } from 'rxjs';
import { take } from 'rxjs/operators';

import {
  CouchDBDocument
} from './types';

export class CouchDBDocumentCollection {
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

  public get(id: string): BehaviorSubject<CouchDBDocument> | null {
    if (this.documents[id] === undefined) {
      return null;
    } else {
      return this.documents[id];
    }

  }

  public set(document: any): BehaviorSubject<CouchDBDocument> {
    const doc = this.get(document['_id']);
    if (doc !== null) {
      doc.next(document);
      return doc;
    } else {
      return this.add(document);
    }

  }

}
