import { CouchDB } from "./couchdb";
import { Observable, Observer } from 'rxjs';

export interface CouchDBAuthenticationStrategy {
  authenticate(couchDbInstance: CouchDB): Observable<void>;
}

export class CouchDBOpenAuthenticationStrategy implements CouchDBAuthenticationStrategy {
  public authenticate(couchDbInstance: CouchDB): Observable<void> {
    return Observable
      .create((observer: Observer<any>): void => {
        observer.complete();
      });

  }

}

export class CouchDBCookieAuthenticationStrategy implements CouchDBAuthenticationStrategy {
  constructor(
    private username: string,
    private password: string) {
  }

  public authenticate(couchDbInstance: CouchDB): Observable<void> {
    return Observable
      .create((observer: Observer<any>): void => {
        couchDbInstance.authenticate(this.username, this.password)
          .subscribe(() => {
            observer.complete();
          });

      });

  }

}
