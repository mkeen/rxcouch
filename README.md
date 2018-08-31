# 🛋 RxCouch
Subscribe to documents in CouchDB easily. Don't worry about the change feed API. Just make dope real-time UI's. Powered by [RxHttp](https://github.com/mkeen/rxhttp), which I wrote specifically with real-time strongly-typed json feeds in mind. It's ReactiveX all the way down, folks.

### Features

📡 Automatic Change Notification  
   RxCouch keeps track of all documents that you are currently subscribed to.  
   It is always subscribed to CouchDB's _`changes` and utilizes the `_doc_ids`  
   filter to ensure you only get the changes you have asked for. A document is  
   a `BehaviorSubject`. RxCouch is real-time by default.
   
😎 Automatic Document Fetching  
   If you subscribe to a document id that RxCouch hasn't seen yet, it will be  
   automatically and transparently fetched, before being injected into a  
   `BehaviorSubject` and returned.

install: `npm install @mkeen/rxcouch`

### Examples

```
import { CouchWatcher } from '@mkeen/rxcouch';

interface Person implements CouchDBDocument {
  name: String;
  email: String;
}

this.couch = new CouchWatcher('127.0.0.1', 5984, 'items');
this.couch.doc({_id: '4b75030702ae88064daf8182ca00364e'})  // Pass in a partial doc from
  .subscribe((document: Person) => {                       // local cache or wherever.
    // It's a free country                                 // RxCouch will fetch the entire doc
  }                                                        // and return a BehaviorSubject which
                                                           // will be automatically updated in
);                                                         // real time. Isn't that nice? :)
```

🇺🇸 American Software
