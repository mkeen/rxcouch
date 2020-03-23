import { CouchDB } from '../couchdb';
import { CouchSession } from '../couchsession';

import { BehaviorSubject } from 'rxjs';
import { AuthorizationBehavior } from '../types';

const creds = new BehaviorSubject({
  username: 'guest',
  password: 'guest'
});

const session = new CouchSession(AuthorizationBehavior.cookie, 'http://10.0.0.115:5984/_session', creds);

const test = new CouchDB({
  dbName: 'test1234',
  host: '10.0.0.115',
  port: 5984,
  ssl: false
}, session);

test.changes().subscribe((doc:any) => {
  console.log(doc);
})

test.doc('a1dbb2ee435eb823306c3f2b0400053e').subscribe((doc: any) => {
  console.log("doooooc!!!!", doc);
})

process.stdin.resume();