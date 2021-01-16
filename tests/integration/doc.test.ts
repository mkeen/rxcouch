import { CouchDB, CouchDBDocument } from '../../src/rxcouch';
import { CouchDBSession } from '../../src/couchdbsession';
import { take, skip } from 'rxjs/operators';

import { BehaviorSubject } from 'rxjs';
import { AuthorizationBehavior } from '../../src/types';

import { session, host, port, ssl } from './helper';

describe('documents', () => {
  let connection: CouchDB;
  let uuid: string;

  beforeAll(() => {
    uuid = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 11);
  });

  beforeEach(done => {
    const temp = new CouchDB({
      host,
      port,
      ssl,
    }, session);
    
    const sub = temp.createDb(uuid).pipe(take(1)).subscribe((_created) => {
      connection = new CouchDB({
        dbName: uuid,
        host: '192.168.1.103',
        port: 5984,
        ssl: false
      }, session);
      
      done();
      sub.unsubscribe();
    });
      
  });
  
  afterEach(done => {
    connection.reconfigure({trackChanges: false});
    const sub = connection.deleteDb(uuid).pipe(take(1)).subscribe((_deleted) => {
      done();
      sub.unsubscribe();
    });
    
  });
  
  test('list all', done => {
    const sub = connection.all().pipe(take(1)).subscribe((all) => {
      const keys = Object.keys(all);
      expect(keys).toContain('total_rows');
      expect(keys).toContain('offset');
      expect(keys).toContain('rows');
      done();
      sub.unsubscribe();
    })
  })
  
  test('create, edit, subscribe', done => {
    connection.doc({test1: 'test1'}).pipe(take(1)).subscribe((doc: any) => {
      expect(doc.test1).toBe('test1');
      let sub2;
      const sub = connection.doc(doc._id).pipe(skip(1), take(1)).subscribe((subDoc) => {
        expect(subDoc.field2).toBe('test2');
        done();
        sub2.unsubscribe();
        sub.unsubscribe();
      });
      
      doc.field2 = 'test2';
      sub2 = connection.doc(doc).pipe(take(1)).subscribe((doc2: any) => {
        expect(doc2.field2).toBe('test2');
      });
      
    });
    
  });
  
  test('delete', done => {
    const sub1 = connection.doc({'to_be_deleted': true}).pipe(take(1)).subscribe((_x) => {
      const sub2 = connection.delete([_x]).subscribe((resp) => {
        for (let i = 0; i < resp.length; i++) {
          expect(resp[i].ok).toBe(true);
        }
        
        done();
        sub1.unsubscribe();
        sub2.unsubscribe();
      });
      
    });
    
  });
  
});
