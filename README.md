# 🛋 RxCouch
Read, Write and Subscribe to documents in CouchDB with impunity. Don't worry about the change feed API. Just make efficient and dope real-time UI's. Powered by [RxHttp](https://github.com/mkeen/rxhttp), which I wrote specifically with real-time strongly-typed json feeds in mind. It's ReactiveX all the way down, folks.

### Features

📡 **Automatic Change Notification** -- RxCouch keeps track of all documents that you touch. RxCouch is always subscribed to CouchDB's _`changes` feed and utilizes the `_doc_ids` filter to ensure you only get the changes to relevant documents. A document is a `BehaviorSubject`. RxCouch is real-time by default. RxCouch tracks all documents that you get, modify, or create by default, but you can also specify (and update at your leisure) a list of ids that you would like to subscribe to updates for.
   
😎 **Automatic Document Fetching** -- If you subscribe to a document id that RxCouch hasn't seen yet, it will be automatically and transparently fetched, before being injected into a `BehaviorSubject` and returned. The `BehaviorSubject` will, of course, be automatically updated in real-time via the `_changes` feed, or when it has been modified by another component of your application.  
   
💾 **Automatic Document Creation** -- If you pass in a document, without an `_id` field, RxCouch will automatically add it to the database, and return a `BehaviorSubject` that will, of course, be automatically updated in real-time via the `_changes` feed, or when it has been modified by another component of your application.  
   
📝 **Automatic Document Editing** -- If you pass in a complete document that doesn't match a previously received version, the new version will be sent to couchdb and saved. Any other subscribers will be notified of the change once couchdb has successfully saved it.
  
Powered by [rxhttp](https://www.npmjs.com/package/@mkeen/rxhttp)  

install: `yarn add @mkeen/rxcouch`

### Usage
`CouchDB` is the class you will interact with most. Specifically, the `doc` function. An instance  
of `CouchDB` provides the `doc` function, which accepts any document that conforms to `CouchDBDocument`,  
`CouchDBPreDocument`, or a Document Id in the form of a `string`. This function will always return a  
`BehaviorSubject` which contains the most up to date version of the resulting document in CouchDB.  
  
All calls to `doc` will result the resulting Document Id being added to the `_changes` watcher. The watcher  
will transparently update all returned `BehaviorSubject`s in real time when the documents they represent  
are modified in the database. This is the main feature of RxCouch.

Complete documentation coming soon. The below examples should be sufficient to get started, and the code  
is super readable if you need to dive in further.

### Examples

```
import { CouchDB } from '@mkeen/rxcouch';

interface Person implements CouchDBDocument {
  name: String;
  email: String;
}

// Connect to a CouchDB Database
this.couch = new CouchDB('127.0.0.1', 5984, 'items');

// Get the latest version of a known document.
this.couch.doc('4b75030702ae88064daf8182ca00364e')   // Pass in a document id of a known document,
  .subscribe((document: Person) => {                 // and it will be fetched, returned and
    // It's a free country                           // subscribed to.
  }

);

// Create, store, and subscribe to a new person...
const new_person: Person = {
  name: 'Chelsei',
  email: 'c.san@bytewave.co'
}

this.couch.doc(new_person)             // Pass in a document without an _id field and a new
  .subscribe((document: Person) => {   // document will be automatically created in CouchDB.
    // It's a free country             // The new document will be added to the _changes
  })                                   // detection subscription, a BehaviorSubject will
                                       // be returned. This BehaviorSubject will be
                                       // automatically returned in real time. :)
```                                       
  
  
  
🇺🇸
