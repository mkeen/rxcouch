import { BehaviorSubject, Observable, Observer, of } from 'rxjs';
import { take, mergeAll, map } from 'rxjs/operators';
import { CouchDBDocument, CouchDBDocumentIndex, CouchDBHashIndex } from './types';
import { sha256 } from 'js-sha256';
import * as _ from "lodash";

export class CouchDBDocumentCollection {
  public ids: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);
  private documents: CouchDBDocumentIndex = {};
  private snapshots: CouchDBHashIndex = {};

  public changed(document: CouchDBDocument): boolean {
    let docCopy = JSON.parse(JSON.stringify(document));
    delete docCopy._rev;

    const snapshot = this.snapshots[docCopy._id];
    if (snapshot === undefined) {
      return true;
    }

    return snapshot !== sha256(
      JSON.stringify(docCopy)
    );

  }

  public snapshot(document: CouchDBDocument) {
    let docCopy = JSON.parse(JSON.stringify(document));
    delete docCopy._rev;

    return this.snapshots[document._id] = sha256(
      JSON.stringify(docCopy)
    );

  }

  public clear(): void {
    this.documents = {};
    this.ids.next([]);
  }

  public doc(document: CouchDBDocument | string): BehaviorSubject<CouchDBDocument> {
    if (typeof (document) === 'string') {
      return this.documents[document];
    }

    if (this.isKnownDocument(document._id)) {
      if (this.changed(document)) {
        this.documents[document._id].next(document);
        this.snapshot(document);
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

  public isValidCouchDBDocument(entity: any): boolean {
    return '_id' in entity && '_rev' in entity;
  }

  public isPreDocument(item: any): boolean {
    return !this.isValidCouchDBDocument(item);
  }

  public add(document: CouchDBDocument): void {
    this.documents[document._id] = new BehaviorSubject<CouchDBDocument>(document);
    this.ids.next(
      _.sortBy(
        _.union(this.ids.value, [document._id])
      ));
  }

}
