# rxcouch
Simple Change Notification RxJs CouchDB Client

Interact with a CouchDB change stream via RxJs BehaviorSubjects. Supports typed responses via generics. Just tell the watcher what documents you're interested in, then create subscriptions to the documents themselves.

ex: 

```
this.couch = new CouchWatcher('127.0.0.1', 5984, 'items', ["document_id_here"]);
this.couch.documents.get("document_id_here")
  .subscribe((document) => {
    if (document['items']) {
      this.loading.next(false);
      this.categories.next(document['items']);
      this.cdRef.detectChanges();
    }
  }
);
