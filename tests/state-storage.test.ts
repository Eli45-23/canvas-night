import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initializeStorage,readState,saveState,splitState} from '../lib/state-storage.ts';
function fixture() {
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE shop_state(id INTEGER PRIMARY KEY,revision INTEGER,body TEXT)');
 sql.prepare('INSERT INTO shop_state VALUES(1,7,?)').run(JSON.stringify({workers:[{hours:42}]}));
 const db:any={prepare(query:string){return {query,args:[] as any[],bind(...args:any[]){this.args=args;return this;}};},async batch(statements:any[]){sql.exec('BEGIN');try{const result=statements.map(s=>{const q=sql.prepare(s.query);if(s.query.startsWith('SELECT'))return {results:q.all(...s.args),meta:{changes:0}};return {results:[],meta:{changes:Number(q.run(...s.args).changes)}};});sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {db,sql};
}
test('legacy records remain exact; large saves migrate without losing checkpoints or Unicode',async()=>{
 const {db,sql}=fixture();await initializeStorage(db);
 assert.deepEqual(await readState(db),{revision:7,state:{workers:[{hours:42}]}});
 const state={text:'x'.repeat(31990)+'😀'.repeat(600000),checkpoint:{hours:42}};
 assert(splitState(state).every(p=>Buffer.byteLength(p)<128001));
 assert(await saveState(db,7,state));assert.deepEqual(await readState(db),{revision:8,state});
 assert.equal((sql.prepare('SELECT revision FROM shop_state').get() as any).revision,7);
 await initializeStorage(db);assert.deepEqual(await readState(db),{revision:8,state});
});
test('stale writers cannot overwrite or remove the winning save; shorter saves remove old parts',async()=>{
 const {db}=fixture();await initializeStorage(db);assert(await saveState(db,7,{text:'x'.repeat(100000)}));
 assert.equal(await saveState(db,7,{text:'stale'}),false);
 assert.equal((await readState<any>(db)).state.text.length,100000);
 assert(await saveState(db,8,{text:'short'}));assert.deepEqual(await readState(db),{revision:9,state:{text:'short'}});
});
test('failed part insertion rolls back revision and all records',async()=>{
 const {db,sql}=fixture();await initializeStorage(db);await saveState(db,7,{text:'before'});
 sql.exec("CREATE TRIGGER fail_part BEFORE INSERT ON shared_state_parts BEGIN SELECT RAISE(ABORT,'test failure'); END");
 await assert.rejects(saveState(db,8,{text:'after'}));assert.deepEqual(await readState(db),{revision:8,state:{text:'before'}});
});
