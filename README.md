# 🛋 RxCouch
Read, Write and Subscribe to documents in CouchDB in real-time with impunity. A document is a `BehaviorSubject` and will automatically be updated from the database's `_changes` feed. Edits via calling `.next` are seamless and propagate across your local application, as well as other subscribers' applications instantly.
  
### Why?
CouchDB is a fantastic database for powering real-time user interfaces... but to truly bind to a document in real-time, there is a bit of work required around consuming the change feed API in an effective and scalable manner. RxCouch makes it so that you only have to reason about documents -- they'll be updated automatically for you -- and you don't have to care about the change feed particulars.

### Features

📀 **Universal** -- Works on both NodeJS and Browser  

🔐 **Authentication** -- Supports wide open CouchDB databases (admin party) as well as protected databases.

📡 **Automatic Change Notification** -- RxCouch keeps track of all documents that it touches. By default, RxCouch is always subscribed to CouchDB's `_changes` feed and utilizes the `_doc_ids` filter to ensure you only get the changes to documents you've fetched or created in the current scope of your user interface.
   
💾 **Automatic Document Creation** -- If you pass in a document, without an `_id` field, RxCouch will automatically create it in the database and return a `BehaviorSubject`.
   
📝 **Automatic Document Editing** -- If you pass in a complete document that doesn't match a previously received version of a known document (one that the current scope of your user interface has fetched or created), the new version will be sent to couchdb and saved. If other users of your application are watching this document, they will receive the new version of the document in real-time.  

😎 **Automatic Document Fetching** -- If you subscribe to a document `_id` that RxCouch hasn't seen yet, it will be automatically and transparently fetched, before being injected into a `BehaviorSubject` and returned.
  
### Install
`npm install @mkeen/rxcouch`  
https://www.npmjs.com/package/@mkeen/rxcouch

### Usage
`CouchDB` is the class you will interact with most. An instance of `CouchDB` provides the `doc` method, which accepts as an argument any document that conforms to `CouchDBDocument` or `CouchDBPreDocument` (a way of expressing a document that isn't persisted yet), or a Document `_id` -- in the form of a `string`. A call to `.doc` returns a `BehaviorSubject`.
  
All calls to `doc` will result in the relevent doc `_id` being added to the `_changes` watcher's  `_doc_ids` filter. All `doc` `BehaviorSubject`s will be kept up to date in real time as the documents they represent are modified in the database.
  
Passing a modified version of the document `.next` on any `BehaviorSubject` returned from `doc` will result in any modifications being immediately written to the database.

### Example

```typescript
import { CouchDB,                                               // Base class you'll interact with
         AuthorizationBehavior,                                 // Toggle open vs cookie login
         CouchDBCredentials                                     // Credentials (only required for cookie)
} from '@mkeen/rxcouch';

interface Person implements CouchDBDocument {                   // RxCouch is written in TypeScript and
  name: String;                                                 // fully supports typed docs. Define an
  email: String;                                                // interface and then have at it. Or just
}                                                               // use `any` types

// Connect to a CouchDB Database
const couchDBInstance = new CouchDB({
      dbName: "mydbnamehere",
      host: "localhost"
    }, AuthorizationBehavior.cookie,                            
      of({username: 'username',                                 // In this example, the username and password
      password: 'password'}}                                    // are hardcoded. But by using an observable,
    );                                                          // the password can be propmted for and 
                                                                // supplied interactively by a UI.
    
// Get the latest version of a known document.
const couchDBInstance.doc('4b75030702ae88064daf8182ca00364e')   // Pass in a document id of a document stored in
  .subscribe((document: Person) => {                            // the db and it will be fetched, returned and
    // It's a free country                                      // subscribed to.
  }

);

// Create, store, and subscribe to a new person.
const new_person: Person = {
  name: 'Chelsei',
  email: 'c.san@bytewave.co'
}

const couchDBInstance.doc(new_person)                          // Pass in a document without an _id field and a
  .subscribe((document: Person) => {                           // new document will be automatically stored, 
    // It's a free country                                     // returned and subscribed to.
  });
```                                       


🇺🇸
