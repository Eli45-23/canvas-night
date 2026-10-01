import {test} from 'node:test';import assert from 'node:assert/strict';
import {seed,apply,total,coverage,type State} from '../lib/engine.ts';
function fixture(){
 const s=seed();s.workers=s.workers.slice(0,2);s.workers.forEach(w=>{w.days=[];w.rdo='SM';});s.current='c';s.canvases=[{id:'c',date:'2026-10-02',reviewed:true,baseline:{}}];
 const start=Date.parse('2026-10-04T22:00:00-04:00');
 s.shifts=[['early','Chip-out',start-28800000],['banks','Banks',start],['target','Chip-out',start]].map(([id,type,t])=>({id:String(id),type:String(type),start:Number(t),end:Number(t)+28800000,canvas:'c',group:'SM',locations:[{name:'A',required:1}],closed:true,canceled:false}));
 s.responses=s.shifts.map((e,i)=>({id:'r'+i,worker:s.workers[i===2?1:0].id,shift:e.id,kind:'accept',location:'A',active:true}));
 s.charges=s.responses.map(r=>({id:'charge'+r.id,response:r.id,worker:r.worker,shift:r.shift,kind:'Accepted',hours:8}));
 return apply(s,{type:'absence',response:'r2',reason:'Unavailable'});
}
const move={type:'transferShift',response:'r1',shift:'target',location:'A',reason:'Cover unfilled chip-out'};
test('move keeps preceding shift, transfers eight hours, reopens Banks and fills the call-out',()=>{
 const s=fixture(),w=s.workers[0],before=total(s,w.id),after=apply(s,move);
 assert.equal(total(after,w.id),before);assert.equal(total(after,s.workers[1].id),total(s,s.workers[1].id));
 assert(after.responses.find(r=>r.id==='r0')!.active);assert(!after.responses.find(r=>r.id==='r1')!.active);
 assert.equal(coverage(after,after.shifts[1]).remaining,1);assert.equal(after.shifts[1].closed,false);assert.equal(coverage(after,after.shifts[2]).remaining,0);
 assert.equal(after.adjustments[0].replacement,w.id);assert(after.responses.find(r=>r.id==='r2')!.absent);
 assert.equal(after.charges.filter(c=>c.worker===w.id&&c.shift==='banks').reduce((n,c)=>n+c.hours,0),0);
 assert.match(after.history.at(-1)!.text,/total unchanged/);
 assert.throws(()=>apply(after,move));
 const canceled=apply(after,{type:'cancel',shifts:['target'],reason:'Withdrawn'});assert.equal(total(canceled,w.id),before-8);
});
test('invalid move rejects atomically for conflicts, RDO, capacity, history links and stale records',()=>{
 const cases=[(s:State)=>{s.workers[0].rdo='FS'},(s:State)=>{s.shifts[2].canceled=true},(s:State)=>{s.shifts[2].canvas='other'},(s:State)=>{s.shifts[2].locations[0].required=0},(s:State)=>{s.responses[1].absent=true},(s:State)=>{s.shifts[2].start-=3600000},(s:State)=>{s.charges[1].hours=16},(s:State)=>{s.adjustments[0].replacementResponse='r1'}];
 for(const change of cases){const s=fixture();change(s);const before=structuredClone(s);assert.throws(()=>apply(s,move));assert.deepEqual(s,before);}
 assert.throws(()=>apply(fixture(),{...move,reason:''}));
});
test('undoing destination call-out after transfer restores original worker without double coverage',()=>{
 let s=apply(fixture(),move);s=apply(s,{type:'undoAbsence',id:s.adjustments[0].id,reason:'Original worker returns'});
 assert.equal(coverage(s,s.shifts[2]).remaining,0);assert.equal(coverage(s,s.shifts[1]).remaining,1);assert.equal(total(s,s.workers[0].id),8);
});
