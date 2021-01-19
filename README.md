# RxCouch

`📀 Universal`

Real-time CouchDB client that runs in the browser or nodejs. The change feed is handled automatically. Everything's a `BehaviorSubject`, so you get two-way binding for free.

## Prerequisites

RxJS 6+  
CouchDB 2.3+, CouchDB 3.0+

## Installation

**NPM:** `npm install @mkeen/rxcouch`  
**Yarn:** `yarn install @mkeen/rxcouch`

## Developer Documentation

### Including RxCouch in Your Project

```typescript
import { CouchDB } from '@mkeen/rxcouch';
```

### Initialize RxCouch for Connecting to a CouchDB Database

```typescript
const couchDbConnection = new CouchDB(
  {
    dbName: 'people',
  }
);
```

### Basic Configuration Options

CouchDB is initialized with: `(RxCouchConfig, AuthorizationBehavior?, Observable<CouchDBCredentials>?)`

An `RxCouchConfig` looks like this by default:

{ `host`: 'localhost'  
`port`: 5984  
`ssl`: false  
`trackChanges`: true,
`dbName`: '_users' }

### Configuring Authentication

CouchDB supports [Basic Auth, Cookies, and JWT](https://docs.couchdb.org/en/stable/api/server/authn.html) authentication schemes. This library supports Cookies or JWT (bearer token). For development purposes only, this library also supports open installs of couchdb without security.

Let's take a look at how to initialize RxCouch for connecting to a CouchDB database that has Cookie Authentication configured.

```typescript
import { BehaviorSubject } from 'rxjs';
import { CouchDB,
         CouchSession,
         AuthorizationBehavior } from '@mkeen/rxcouch';

const couchSession: CouchSession = new CouchSession(
  AuthorizationBehavior.cookie,
  `${COUCH_SSL? 'https://' : 'http://'}${COUCH_HOST}:${COUCH_PORT}/_session`,
  new BehaviorSubject({username: 'username', password: 'password'}}),
);

const couchDbConnection = new CouchDB(
  {
    dbName: 'people',
    host: 'localhost',
    trackChanges: true,
  },
  couchSession
);

//...
```

The big detail to note here is that the final argument passed to the CouchSession initializer is an `Observable`. In this example it's hardcoded. In a real-world implementation, you'll create an `Observable` that emits when a user submits a login form, or when a configuration value is read, and pass that `Observable` into the initializer.

Since we're hardcoding the credentials `Observable` argument, the above example will result in an authentication attempt being made to the speficied CouchDB host (without using HTTPS) immediately.

### Getting Info About the Current Session

To determine which user (if any) is currently logged into CouchDB, you can call the `session()` function. `session` returns an `Observable` that emits a `CouchDBSession`.

```typescript
//...
couchDbConnection.session().subscribe((session: CouchDBSession) => {
  console.log('Currently session info: ', session);
});
```

If you're using CouchDB to authenticate users in your application, you could call `session` when your app is initialized in order to determine if a user is logged in, and if so, any other information stored in the `_users` document.

### Dealing with Documents

Whether authentication is used or not, a document is always returned to you by RxCouch in the form a `BehaviorSubject` which provides a real-time two-way data binding with the document.

#### Subscribe to Any Document in Real Time

```typescript
interface Person {
  name: string;
  email?: string;
  phone?: string;
}

const myDocument: BehaviorSubject<Person> = couchDbConnection.doc('778...05b');

myDocument.subscribe((document: Person) => {
  console.log('Most recent person: ', document);
});

//...
```

###### Result

```typescript
Most recent person: { _id: "7782f0743bee05005a548ba8af00205b", _rev: "10-bcaab49ec87c678686984d1c4873cd3e", name: 'Mike" }
```

#### Update The Same Document in Real Time

```typescript
//...
const myCompletelyChangedDocument = {
  name: 'some new name here',
  email: 'mwk@mikekeen.com',
  phone: '323-209-5336'
}

myDocument.next(myCompletelyChangedDocument);
```

###### All Connected Clients Result:

```typescript
Most recent person: { _id: "7782f0743bee05005a548ba8af00205b", _rev: "11-bf3003bb5f63b875db4284f319a0b918", name: "some new name here", email:  "mwk@mikekeen.com", phone: "323-209-5336"}
```

### Creating And Modifying Documents

In the above example, a document was fetched by its `_id`. The `doc()` function alternatively accepts an object as an argument. If an object is passed in, one of two things will happen:

1. If the object contains both an `_id` and `_rev` field, the rest of the fields in the object will be used to update the document that matches the `_id`.
2. If the object does not contain both an `_id` and a `_rev` field, then a new document will be created based on the fields contained in the object passed.

Whichever of the above happens, `doc` returns a `BehaviorSubject` that will reflect all future changes to the relevant document, and pass all changes upstream when `.next()` is called.

#### Create a New Document and Subscribe to Future Changes

```typescript
//...
const newlyCreatedPerson = couchDbConnection.doc({
  name: 'tracy',
  email: 'tracy@company.com',
  phone: '323-209-5336'
}).subscribe((doc: Person) => {
  console.log('Person Feed: ', doc);
});
```

###### Result

```typescript
Person Feed: {"_id": "7782f0743bee05005a548ba8af00b4f5", "_rev": "1-2fee21d51258845545ea6506ab138919", "name": "tracy", "email": "tracy@company.com", "phone": "323-209-5336"}
```

#### Modify an Existing Document and Subscribe to Future Changes

There are two ways to modify a document that already exists in CouchDB.

One way, is to simply pass a modified version of the existing document to `doc` like in the example below:

```typescript
//...
couchDbConnection.doc({
  _id: '7782f0743bee05005a548ba8af00b4f5',
  _rev: '1-2fee21d51258845545ea6506ab138919',
  name: 'tracy',
  email: 'tracy@company-modified.com',
  phone: '323-209-5336'
}).subscribe((doc) => {
  console.log('Document Modified: ', doc);
})
```

###### Result

```typescript
Document Modified: { "_id": "7782f0743bee05005a548ba8af00b4f5", "_rev": "2-e654adf15f28b99f26ae1f0dbe8e7c36", "name": "tracy", "email": "tracy@company-modified.com", "phone": "323-209-5336" }

Person Feed: {"_id": "7782f0743bee05005a548ba8af00b4f5", "_rev": "2-e654adf15f28b99f26ae1f0dbe8e7c36", "name": "tracy", "email": "tracy@company-modified.com", "phone": "323-209-5336" }
```

Another way to modify a document that already exists in CouchDB is to just call `next` on an already fetched document's `BehaviorSubject`.

```typescript
//..
newlyCreatedPerson.next({
  name: 'tracy Modified!',
  email: 'tracy@company-modified-again.com',
  phone: '323-209-5336'
});
```

###### Result

```typescript
Person Feed: {"_id": "7782f0743bee05005a548ba8af00b4f5", "_rev": "3-8da970f593132c80ccee83fc4708ce33", "name": "tracy Modified!", "email": "tracy@company-modified-again.com", "phone": "323-209-5336" }
```

### Finding Documents With a Query

RxCouch exposes `find` from `CouchDB` that uses [CouchDB Selector Syntax](https://docs.couchdb.org/en/2.2.0/api/database/find.html#selector-syntax) to make queries, and returns a list of matching documents. Warning: Documents returned are not `BehaviorSubject`s!

### Get a List of Documents That Match a Query

Call `find` with `(CouchDBFindQuery)`.

An `CouchDBFindQuery`, when passed into `find`, should conform to [CouchDB Selector Syntax](https://docs.couchdb.org/en/2.2.0/api/database/find.html#selector-syntax). It can have the following optional properties of the following types:

`selector: CouchDBFindSelector`
`limit: number`
`skip: number`
`sort: CouchDBFindSort[]`
`fields: string[]`
`use_index: string | []`
`r: number`
`bookmark: string`
`update: boolean`
`stable: boolean`
`stale: string`
`execution_stats: boolean`

A call to `find` will return an `Observable` that will emit a list of documents that match the passed query.

```typescript
//...
couchDbConnection.find({
  selector: {
    name: 'tracy'
  }
  
}).subscribe((matchingPeople: Person[]) => {
  console.log('Matching people: ', matchingPeople);
});
```

###### Result

```typescript
Matching people: [{ "_id": "7782f0743bee05005a548ba8af00b4f5", "_rev": "3-8da970f593132c80ccee83fc4708ce33", "name": "tracy Modified!", "email": "tracy@company-modified-again.com", "phone": "323-209-5336" }]
```

#### Get Real-Time Feeds for Found Documents

```typescript
//...
couchDbConnection.find({
  selector: {
    name: 'some new name here'
  }
  
}).subscribe((matchingPeople: Person[]) => {
  const documentFeeds = matchingPeople.map((person: Person) => {
    return couchDbConnection.doc(matchingPeople)
  });
  
  documentFeeds.forEach((feed) => {
    feed.subscribe(
      (document: Person) => console.log('Latest person: ', document)
    );
    
  });
  
});
```

###### Result

```typescript
Latest person: { "_id": "7782f0743bee05005a548ba8af00b4f5", "_rev": "3-8da970f593132c80ccee83fc4708ce33", "name": "tracy Modified!", "email": "tracy@company-modified-again.com", "phone": "323-209-5336" }
```

## 🚂 Under the Hood

#### Document Tracking

Documents are automatically cached and then tracked for changes. `CouchDBDocumentCollection` handles both caching and change tracking.

##### Cache

Instances of `CouchDB` have a method called `doc`. Any documents that flow through `doc` are cached in a `CouchDBDocumentCollection`. They can later be retrieved by _id in the form of a `BehaviorSubject` that supports two way binding. A hash of the document is indexed (by document id) for change tracking purposes.

##### Change Tracking

Before document changes are propagated either to or from a `BehaviorSubject`, the potentially changed document is hashed and compared against a previously indexed  hash of the document. If the hashes don't match, the document has changed, and it will be passed into the `next` method of the relavent indexed `BehaviorSubject`. Finally, the indexed hash entry for the document will be updated.

## Thank you for using RxCouch!

🇺🇸
