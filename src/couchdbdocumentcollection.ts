import { BehaviorSubject, Observable, Observer, of } from 'rxjs';
import { take, mergeAll, map } from 'rxjs/operators';
import { CouchDBDocument, CouchDBDocumentIndex, CouchDBHashIndex } from './types';
import { sha256 } from 'js-sha256';
import * as _ from "lodash";

export class CouchDBDocumentCollection {
  private documents: CouchDBDocumentIndex = {};
  public ids: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);
  private snapshots: CouchDBHashIndex = {};

  public changed(document: CouchDBDocument): boolean {
    const snapshot = this.snapshots[document._id];
    if (snapshot === undefined) {
      return false;
    }

    return snapshot === sha256(JSON.stringify(document))
  }

  public clear(): void {
    this.documents = {};
    this.ids.next([]);
  }

  public doc(document: CouchDBDocument | string): BehaviorSubject<CouchDBDocument> {
    return Observable.create((observer: Observer<BehaviorSubject<CouchDBDocument>>): void => {
      if (!this.isDocument(document)) {
        document = { _id: document };
      }

      if (this.documents[document._id] !== undefined) {
        if (this.isDocument(document)) {
          this.snapshots[document._id] = sha256(
            JSON.stringify(
              document
            )
          );

          this.documents[document._id].next(document);
        }

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
    return (<CouchDBDocument>item)._id !== undefined;
  }

  private add(document: CouchDBDocument): Observable<string> {
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
