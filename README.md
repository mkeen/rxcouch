# rxcouch
Simple Change Notification RxJs CouchDB Client

Subscribe to documents in CouchDB easily. Don't worry about the change feed API. Just make dope real-time UI's.

install: `npm install @mkeen/rxcouch`

simple ex: 

```
import { CouchWatcher } from '@mkeen/rxcouch';

interface Person implements CouchDBDocument {
  name: String;
  email: String;
}

this.couch = new CouchWatcher('127.0.0.1', 5984, 'items');
this.couch.doc({_id: '4b75030702ae88064daf8182ca00364e'})  // Pass in a partial doc from
  .subscribe((document: Person) => {                       // local cache. RxCouch will
    // It's a free country                                 // fetch the entire doc and
  }                                                        // return a BehaviorSubject which
);                                                         // will be automatically updated
                                                           // in real time.
                                                           // Isn't that nice? :)
