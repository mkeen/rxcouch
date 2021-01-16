import { CouchDB, CouchDBDocument } from '../src/rxcouch';
import { CouchDBSession } from '../src/couchdbsession';
import { take, skip } from 'rxjs/operators';

import { BehaviorSubject } from 'rxjs';
import { AuthorizationBehavior } from '../src/types';

import { session, host, port, ssl } from './helper';

describe('databases', () => {
  let connection: CouchDB;
  let uuid: string;
  
  beforeAll(() => {
    uuid = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 11);
  });
  
  beforeEach(done => {
    const temp = new CouchDB({
      host,
      port,
      ssl
    }, session);
    
    temp.createDb(uuid).pipe(take(1)).subscribe((_created) => {
      connection = new CouchDB({
        dbName: uuid,
        host,
        port,
        ssl
      }, session);
      
      done();
    });
      
  });
  
  afterEach(done => {
    connection.closeChangeFeed();
    connection.deleteDb(uuid).pipe(take(1)).subscribe((_deleted) => {
      done();
    });
    
  });
  
  test('apply security policy', done => {
    connection.secureDb(uuid, {admins: { names: ['admin', 'mike'], roles: [] }, members: { names: [], roles: [] } }).pipe(take(1)).subscribe((securityResult) => {
      expect(securityResult.ok).toBe(true);
      done();
    });
    
  });
  
});
