import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seed,latestReplacementCanvas,replacementAssignments,type State} from '../lib/engine.ts';
function fixture(){
 const s=seed();
 s.canvases=['2026-09-25','2026-10-02'].map((date,i)=>({id:`canvas-${i}`,date,reviewed:true,baseline:{}}));
 s.current='canvas-0';
 s.shifts=s.canvases.map(c=>({id:c.id,canvas:c.id,type:'Banks',start:0,end:1,locations:[],closed:false,canceled:false}));
 s.responses=s.shifts.map(e=>({id:e.id,worker:s.workers[0].id,shift:e.id,kind:'accept',location:'Banks',active:true}));
 return s;
}
test('replacement assignments use latest period even when an older canvas is selected',()=>{
 const s=fixture(),before=structuredClone(s);
 assert.equal(latestReplacementCanvas(s)?.id,'canvas-1');
 assert.deepEqual(replacementAssignments(s).map(r=>r.id),['canvas-1']);assert.deepEqual(s,before);
 s.canvases.reverse();assert.equal(latestReplacementCanvas(s)?.id,'canvas-1');
});
test('latest replacement list excludes canceled, refused, absent and inactive assignments',()=>{
 for(const change of [(s:State)=>{s.shifts[1].canceled=true},(s:State)=>{s.responses[1].kind='refuse'},(s:State)=>{s.responses[1].absent=true},(s:State)=>{s.responses[1].active=false}]){
  const s=fixture();change(s);assert.deepEqual(replacementAssignments(s),[]);
 }
});
test('empty or canceled newest canvas never falls back to old assignments',()=>{
 const s=fixture();s.canvases[1].canceled=true;assert.deepEqual(replacementAssignments(s),[]);
 s.canvases[1].canceled=false;s.responses.pop();assert.deepEqual(replacementAssignments(s),[]);
 assert.deepEqual(replacementAssignments(seed()),[]);
});
