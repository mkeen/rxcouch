import { BehaviorSubject } from 'rxjs';
import { CouchDBDocument } from './types';

export class CouchDBDocumentCollection {
  private documents: any = {};
  public ids: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);

  public doc(document: any): BehaviorSubject<CouchDBDocument> {
    const doc = this.find(document['_id']);
    if (doc !== null) {
      doc.next(document);
      return doc;
    } else {
      return this.add(document);
    }

  }

  public docId(document_id: string): BehaviorSubject<CouchDBDocument> {
    return this.doc({ _id: document_id });
  }

  public hasId(document_id: string): boolean {
    return this.find(document_id) !== null
  }

  private add(document: CouchDBDocument): any {
    return this.documents[document._id] = new BehaviorSubject<CouchDBDocument>(document);
  }

  private find(document_id: string): BehaviorSubject<CouchDBDocument> | null {
    if (this.documents[document_id] === undefined) {
      return null;
    } else {
      return this.documents[document_id];
    }

  }

}
