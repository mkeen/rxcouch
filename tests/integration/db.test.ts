  import { CouchDB, CouchDBDocument } from '../../src/rxcouch';
import { take, skip } from 'rxjs/operators';

import { session, host, port, ssl, } from './helper';

describe('databases', () => {
  let connection: CouchDB;
  let uuid: string;

  beforeAll(() => {
    uuid = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 11);
    connection = new CouchDB({
      host,
      port,
      ssl,
    }, session);
  });
  
  test('create', done => {
    const sub = connection.createDb(uuid).pipe(take(1)).subscribe((dbResult) => {
      expect(dbResult.ok).toBe(true);
      done();
      sub.unsubscribe();
    });
    
  });
  
  test('delete', done => {
    const sub = connection.deleteDb(uuid).pipe(take(1)).subscribe((dbResult) => {
      expect(dbResult.ok).toBe(true);
      done();
      sub.unsubscribe();
    });
    
  });
  
});
