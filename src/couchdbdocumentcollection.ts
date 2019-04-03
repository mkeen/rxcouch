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
    console.log(document)
    const snapshot = this.snapshots[document._id];
    if (snapshot === undefined) {
      return true;
    }

    return snapshot !== sha256(JSON.stringify(document))
  }

  public snapshot(document: CouchDBDocument) {
    return this.snapshots[document._id] = sha256(
      JSON.stringify(
        document
      )

    );

  }

  public clear(): void {
    this.documents = {};
    this.ids.next([]);
  }

  public doc(document: CouchDBDocument | string): BehaviorSubject<CouchDBDocument> {
    return Observable.create((observer: Observer<BehaviorSubject<CouchDBDocument>>): void => {
      if (typeof (document) === 'string') {
        observer.next(this.documents[document]);
        observer.complete();
        return;
      }

      if (this.documents[document._id] !== undefined) {
        if (!this.hasId(document._id)) {
          this.documents[document._id] = new BehaviorSubject<CouchDBDocument>(document);
        } else {
          if (this.changed(document)) {
            this.documents[document._id].next(document);
          }

        }

        this.snapshot(document);
        observer.next(this.documents[document._id]);
        observer.complete();
      } else {
        this.add(document)
          .subscribe((document_id: string) => {
            this.ids.next(
              _.sortBy(
                _.union(this.ids.value, [document_id])
              ));

            observer.next(this.documents[document_id]);
            observer.complete();
          });

      }

    }).pipe(
      mergeAll()
    );

  }

  public hasId(document_id: string): boolean {
    return this.documents[document_id] !== undefined;
  }

  public isDocument(item: any): item is CouchDBDocument {
    return (<CouchDBDocument>item)._rev !== undefined;
  }

  public isPreDocument(item: any): item is CouchDBDocument {
    return (<CouchDBDocument>item)._id === undefined;
  }

  public add(document: CouchDBDocument): Observable<string> {
    return Observable.create((observer: Observer<string>): void => {
      this.ids
        .pipe(
          take(1)
        ).subscribe((ids: string[]): void => {
          this.documents[document._id] = new BehaviorSubject<CouchDBDocument>(document);
          observer.next(document._id);
        });

    });

  }

}
