import { CouchDBSession } from '../../src/couchdbsession'; 
import { BehaviorSubject } from 'rxjs';
import { AuthorizationBehavior } from '../../src/types';

const creds = new BehaviorSubject({
  name: 'admin',
  password: 'admin'
});

export const host = '127.0.0.1';
export const port = 5984;
export const ssl = false;
export const session = new CouchDBSession(AuthorizationBehavior.cookie, `http://${host}:${port}/_session`, creds);
