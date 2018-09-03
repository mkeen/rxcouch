import { BehaviorSubject, Observable, Observer, of } from 'rxjs';
import { take, mergeAll, map } from 'rxjs/operators';
import { CouchDBBatch } from './couchdbbatch';
import { CouchDBDocument } from './types';
import * as _ from "lodash";

export class CouchDBDocumentCollection {
  private batch: CouchDBBatch | null = null;
  private documents: any = {};
  public ids: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);

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
        if (!this.isFragment(document)) {
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

  private isFragment(document: CouchDBDocument): boolean {
    return Object.keys(document).length === 1;
  }

}
