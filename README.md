# rxcouch
Simple Change Notification RxJs CouchDB Client

Interact with a CouchDB change stream via RxJs BehaviorSubjects. Supports typed responses with generics. Just tell the watcher what documents you're interested in, then create subscriptions to the documents themselves.

install: `npm install @mkeen/rxcouch`

ex: 

```
this.couch = new CouchWatcher('127.0.0.1', 5984, 'items');
this.couch.documents.get("document_id_here")
  .subscribe((document) => {
    if (document['items']) {
      // Do as thou wilt
    }
  }
);
