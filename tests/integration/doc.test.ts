import { CouchDB } from '../../src/rxcouch';
import { zip } from 'rxjs';
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
        host: '192.168.1.162',
        port: 5984,
        ssl: false
      }, session);

      sub.unsubscribe();
      done();
    });
      
  });
  
  afterEach(done => {
    connection.reconfigure({trackChanges: false});
    const sub = connection.deleteDb(uuid).pipe(take(1)).subscribe((_deleted) => {
      sub.unsubscribe();
      done();
    });
    
  });
  
  test('list all', done => {
    const sub = connection.all().pipe(take(1)).subscribe((all) => {
      const keys = Object.keys(all);
      expect(keys).toContain('total_rows');
      expect(keys).toContain('offset');
      expect(keys).toContain('rows');
      connection.reconfigure({trackChanges: false});
      sub.unsubscribe();
      done();
    })
  })
  
  test('create, edit, subscribe', done => {
    connection.doc({test1: 'test1'}).pipe(take(1)).subscribe((doc: any) => {
      console.log(doc)

      
    });
    
  });
  
  test('delete', done => {
    const sub1 = connection.doc({'to_be_deleted': true}).pipe(take(1)).subscribe((document) => {
      const sub2 = connection.delete(document._id, document._rev).subscribe((resp) => {
        expect(resp.ok).toBe(true);
        connection.reconfigure({trackChanges: false});
        sub1.unsubscribe();
        sub2.unsubscribe();
        done();
      });
      
    });
    
  });

  test('bulk modify', done => {
    const initialDocs = [
      connection.doc({initial_document_value: true, static_document_value: true}).pipe(take(1)),
      connection.doc({initial_document_value: true, static_document_value: true}).pipe(take(1)),
      connection.doc({initial_document_value: true, static_document_value: true}).pipe(take(1)),
      connection.doc({initial_document_value: true, static_document_value: true}).pipe(take(1)),
    ];

    const sub1 = zip(...initialDocs).subscribe((initial_documents) => {
      const changed_documents = initial_documents.map((initial_document) => {
        Object.assign(initial_document, { initial_document_value: false });
        //delete initial_document.static_document_value; // if this line uncommented, test will fail, because edits are not patches. todo: investigate
        return initial_document;
      });

      connection.bulkModify(changed_documents).subscribe((changed) => {
        const changedIds: string[] = [];
        for(const {ok, rev, id} of changed) {
          expect(ok).toBe(true); // expect that the change succeeded
          expect(parseInt(rev[0])).toBe(2); // expect the revision to start with '2', since it should be changed once
          changedIds.push(id);
        }

        zip(...changedIds.map(changedId => connection.doc(changedId))).pipe(take(1)).subscribe((confirmed) => {
          expect(confirmed.length).toBe(initialDocs.length); // modified is same length as initial
          for(const {initial_document_value, static_document_value} of confirmed) {
            expect(initial_document_value).toBe(false); // intended value was changed
            expect(static_document_value).toBe(true);
          }

          done();
        })

      });

    });

  });
  
});
