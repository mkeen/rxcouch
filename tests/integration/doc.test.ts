import { CouchDB } from '../../src/rxcouch';
import { zip } from 'rxjs';
import { take, skip, flatMap } from 'rxjs/operators';

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
    
    temp.createDb(uuid).pipe(take(1)).subscribe((_created) => {
      connection = new CouchDB({
        dbName: uuid,
        host: '192.168.1.162',
        port: 5984,
        ssl: false,
        trackChanges: true,
      }, session);

      done();
    });
      
  });
  
  afterEach(done => {
    connection.reconfigure({trackChanges: false});
    connection.deleteDb(uuid).pipe(take(1)).subscribe((_deleted) => {
      done();
    });
    
  });
  
  test('list all', done => {
    connection.reconfigure({trackChanges: false});
    connection.all().pipe(take(1)).subscribe((all) => {
      const keys = Object.keys(all);
      expect(keys).toContain('total_rows');
      expect(keys).toContain('offset');
      expect(keys).toContain('rows');
      done();
    })
  })
  
  test('create, subscribe, edit', async done => {
    const test1 = 'test1';
    const test2 = 'test2';
    const test3 = 'test3';
    const stream = await connection.doc({test1});
    let base_rev;
    stream.pipe(take(3)).subscribe(async (doc: any) => {
      if (!doc.test2) {
        base_rev = doc._rev;
        expect(doc._id).toBeTruthy();
        expect(doc._rev).toBeTruthy();
        expect(doc.test1).toBe(test1);
        expect(doc.test2).not.toBeDefined();
        Object.assign(doc, {test2});
        await (await connection.doc(doc)).pipe(take(1)).toPromise();
      } else if (!doc.test3) {
        expect(base_rev).toBeTruthy();
        expect(base_rev).not.toBe(doc._rev);
        expect(doc.test2).toBeDefined();
        Object.assign(doc, {test3});
        await (await connection.doc(doc)).pipe(take(1)).toPromise();
      } else {
        done();
      }
      
    });
    
  });
  
  test('delete', async done => {
    connection.reconfigure({trackChanges: false});
    (await connection.doc({'to_be_deleted': true})).pipe(take(1)).subscribe((document) => {
      connection.delete(document._id, document._rev).subscribe((resp) => {
        expect(resp.ok).toBe(true);
        done();
      });
      
    });
    
  });

  test('bulk modify', async done => {
    const initialDocs = [
      (await connection.doc({initial_document_value: true, static_document_value: true})).pipe(take(1)),
      (await connection.doc({initial_document_value: true, static_document_value: true})).pipe(take(1)),
      (await connection.doc({initial_document_value: true, static_document_value: true})).pipe(take(1)),
      (await connection.doc({initial_document_value: true, static_document_value: true})).pipe(take(1)),
    ];

    zip(...initialDocs).pipe(take(1)).subscribe((initial_documents) => {
      const changedDocs = initial_documents.map((initial_document) => {
        Object.assign(initial_document, { initial_document_value: false });
        //delete initial_document.static_document_value; // if this line uncommented, test will fail, because edits are not patches. todo: investigate
        return initial_document;
      });

      connection.bulkModify(changedDocs).subscribe((changed) => {
        const changedIds: string[] = [];
        for(const {ok, rev, id} of changed) {
          expect(ok).toBe(true); // expect that the change succeeded
          expect(parseInt(rev[0])).toBe(2); // expect the revision to start with '2', since it should be changed once
          changedIds.push(id);
        }

        zip(...changedIds.map(async changedId => (await connection.doc(changedId)))).pipe(take(1)).subscribe((confirmed) => {
          expect(confirmed.length).toBe(initialDocs.length); // modified is same length as initial
          for(const docSub of confirmed) {
            expect(docSub.value.initial_document_value).toBe(false); // intended value was changed
            expect(docSub.value.static_document_value).toBe(true); // original value maintained
          }

          done();
        });

      });

    });

  });
  
});
