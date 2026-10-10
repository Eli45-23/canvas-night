import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../lib/engine.ts';
import {canImport,stateDigest,validateSnapshot} from '../lib/migration.ts';
import {operator} from '../lib/access.ts';
test('import validation retains every field and rejects malformed and duplicate records',()=>{
 const snapshot={state:seed(),revision:42};assert.equal(validateSnapshot(snapshot),snapshot);
 const duplicate=structuredClone(snapshot);duplicate.state.workers.push(duplicate.state.workers[0]);assert.throws(()=>validateSnapshot(duplicate));
 const invalid=structuredClone(snapshot);invalid.state.workers[0].starting=NaN;assert.throws(()=>validateSnapshot(invalid));
});
test('import is locked once any real worker or work exists',()=>{
 const s=seed();assert(canImport(s));s.workers[0].id='real-worker';assert(!canImport(s));
 const t=seed();t.canvases.push({id:'canvas',date:'2026-10-09'} as any);assert(!canImport(t));
});
test('digest detects altered worker hours and retains exact snapshots',async()=>{
 const s=seed();assert.equal(await stateDigest(s),await stateDigest(JSON.parse(JSON.stringify(s))));
 const t=structuredClone(s);t.workers[0].starting+=8;assert.notEqual(await stateDigest(s),await stateDigest(t));
});
test('API authentication fails closed unless explicitly configured local',async()=>{
 const r=new Request('https://example.test/api/state');await assert.rejects(operator(r));await assert.rejects(operator(r,'shared'));
 assert.equal(await operator(r,'local'),'Local operator');
 await assert.rejects(operator(new Request(r,{headers:{'cf-access-jwt-assertion':'fake','cf-access-authenticated-user-email':'eliascolon23@gmail.com'}}),'shared'));
});
