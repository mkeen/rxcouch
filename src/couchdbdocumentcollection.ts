import { BehaviorSubject } from 'rxjs';
import { CouchDBDocument, CouchDBDocumentIndex, CouchDBHashIndex, CouchDBPreDocument } from './types';
import { sha256 } from 'js-sha256';
import * as _ from "lodash";

export class CouchDBDocumentCollection {
  readonly ids: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);
  readonly documents: CouchDBDocumentIndex = {};
  readonly snapshots: CouchDBHashIndex = {};

  public changed(document: CouchDBDocument | CouchDBPreDocument): boolean {
    const docCopy = JSON.parse(JSON.stringify(document));

    if (this.isPreDocument(docCopy)) {
      return true;
    }

    delete docCopy._rev;

    const snapshot = this.snapshots[docCopy._id];
    if (snapshot === undefined) {
      return true;
    }

    return snapshot !== sha256(JSON.stringify(docCopy));
  }

  public snapshot(document: CouchDBDocument) {
    const docCopy = JSON.parse(JSON.stringify(document));
    delete docCopy._rev;

    return this.snapshots[docCopy._id] = sha256(
      JSON.stringify(docCopy)
    );

  }

  public clear(): void {
    for (var document in this.documents) delete this.documents[document];
    this.ids.next([]);
  }

  public doc(document: CouchDBDocument | string): BehaviorSubject<CouchDBDocument> {
    if (typeof (document) === 'string') {
      return this.documents[document];
    }

    if (this.isKnownDocument(document._id)) {
      if (this.changed(document)) {
        this.snapshot(document);
        this.documents[document._id].next(document);
      }

      return this.documents[document._id];
    } else {
      this.add(document);
      this.snapshot(document);
    }

    return this.documents[document._id];
  }

  public isKnownDocument(document_id: string): boolean {
    return this.documents[document_id] !== undefined;
  }

  public isStoredCouchDBDocument(entity: any): boolean {
    return '_id' in entity && '_rev' in entity;
  }

  public isPreDocument(item: any): boolean {
    return !this.isStoredCouchDBDocument(item);
  }

  public add(document: CouchDBDocument): void {
    if(!this.documents[document._id]) {
      this.documents[document._id] = new BehaviorSubject<CouchDBDocument>(document);
      this.ids.next(
        _.sortBy( // todo: I don't think this sort is needed
          _.union(this.ids.value, [document._id])
        )

      );

    }

  }

  public remove(documentId: string): void {
    var index = this.ids.value.indexOf(documentId);
    if(index !== -1) {
      this.ids.next(
        this.ids.value.splice(index, 1)
      );

      delete this.documents[documentId];
    }

  }

}
