import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvasPdf,canvasPdfFilename,paperCanvasSheet} from '../lib/canvas-pdf.ts';
import {apply,seed,type State} from '../lib/engine.ts';
function fixture(){
 let s=apply(seed(),{type:'loadSept18Roster'});
 return apply(apply(s,{type:'review'}),{type:'setup',date:'2026-09-25',canvassedOn:'2026-09-22',locations:['A'],banks:['thu','fri','sat','sun']});
}
function checkPhysicalPages(s:State,group='all',search=''){
 const doc=createCanvasPdf(s,s.current,group,search);
 const boxes=[...doc.output().matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)];
 assert.equal(boxes.length,doc.getNumberOfPages());
 for(const box of boxes)assert.deepEqual(box[1].trim().split(/\s+/).map(Number),[0,0,1080,792]);
 return doc;
}
test('PDF encodes every page at exactly 15 by 11 inches, preserving the source ledger',()=>{
 const s=fixture(),before=structuredClone(s),doc=checkPhysicalPages(s);
 assert.equal(doc.getNumberOfPages(),2);assert.deepEqual(s,before);
 assert.match(canvasPdfFilename(s,s.current),/^canvas-2026-09-25-.*-all-11x15-landscape.pdf$/);
});
test('PDF supports selected RDO groups, search, canceled records, and empty search results',()=>{
 const s=fixture();
 assert.equal(checkPhysicalPages(s,'FS').getNumberOfPages(),1);
 assert.equal(checkPhysicalPages(s,'SM','Santana').getNumberOfPages(),1);
 assert.equal(checkPhysicalPages(s,'FS','No matching worker').getNumberOfPages(),1);
 s.canvases[0].canceled=true;assert.equal(checkPhysicalPages(s).getNumberOfPages(),2);
});
test('large rosters paginate instead of clipping rows and retain landscape dimensions on continuation pages',()=>{
 const s=fixture();
 const roster=Array.from({length:180},(_,i)=>({...s.workers[0],id:`worker-${i}`,name:`Long worker name ${i}`,seniority:i,starting:i}));
 s.workers=roster;s.canvases[0].roster=structuredClone(roster);s.canvases[0].baseline=Object.fromEntries(roster.map(w=>[w.id,w.starting]));
 assert(checkPhysicalPages(s,'FS').getNumberOfPages()>2);
});
test('unknown canvases cannot export an unrelated sheet',()=>{
 const s=fixture();assert.throws(()=>createCanvasPdf(s,'missing'),/saved canvas/);assert.throws(()=>canvasPdfFilename(s,'missing'),/not found/);
});

test('paper layout has exactly the workable shift columns for each saved RDO schedule',()=>{
 const s=fixture();
 const keys=(g:string)=>paperCanvasSheet(s,s.current,g).shifts.map(e=>`${e.type}:${new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',hour12:false}).format(e.start).replace(',', '')}`);
 assert.deepEqual(keys('FS'),['Banks:Thu 22','Chip-out:Fri 22','Chip-out:Sat 06','Chip-out:Sat 14','Chip-out:Sun 06','Chip-out:Sun 14','Banks:Fri 22']);
 assert.deepEqual(keys('SM'),['Chip-out:Sat 06','Chip-out:Sat 14','Chip-out:Sat 22','Chip-out:Sun 06','Chip-out:Sun 14','Chip-out:Sun 22','Banks:Sat 22','Banks:Sun 22']);
 const before=keys('FS');s.workers.filter(w=>w.rdo==='FS').forEach(w=>w.days=[]);
 assert.deepEqual(keys('FS'),before,'current roster edits must not rewrite historical sheet eligibility');
});
test('paper cells show net charged hours, refusal notation, running hours and final total',()=>{
 const s=fixture(),w=s.workers[0],shifts=paperCanvasSheet(s,s.current,'FS').shifts;
 s.charges.push({id:'accept',worker:w.id,shift:shifts[0].id,kind:'Accepted',hours:8},
  {id:'refuse',worker:w.id,shift:shifts[1].id,kind:'Refused',hours:8},
  {id:'reversal',worker:w.id,shift:shifts[0].id,kind:'Reversal',hours:-8,reverses:'accept'});
 const row=paperCanvasSheet(s,s.current,'FS').rows.find(r=>r.worker.id===w.id)!;
 assert.equal(row.cells[0].mark,'0*');assert.equal(row.cells[0].running,w.starting);
 assert.equal(row.cells[1].mark,'R8');assert.equal(row.cells[1].running,w.starting+8);
 assert.equal(row.cells[2].mark,'');assert.equal(row.ending,w.starting+8);
});
test('unworkable historical charges are disclosed separately without adding wrong-day columns or losing totals',()=>{
 const s=fixture(),w=s.workers[0],e=s.shifts.find(e=>e.group==='SM')!;
 s.charges.push({id:'exception',worker:w.id,shift:e.id,kind:'Correction',hours:3});
 const report=paperCanvasSheet(s,s.current,'FS'),row=report.rows.find(r=>r.worker.id===w.id)!;
 assert(!report.shifts.some(x=>x.id===e.id));assert.equal(row.otherHours,3);assert.equal(row.ending,w.starting+3);
 assert.equal(checkPhysicalPages(s,'FS').getNumberOfPages(),2);
});
test('saved dated exceptions mark unavailable workers without hiding other workers eligible for the shift',()=>{
 const s=fixture(),w=s.canvases[0].roster![0];w.overrides.push({date:'2026-09-25',work:true});
 const report=paperCanvasSheet(s,s.current,'FS'),row=report.rows.find(r=>r.worker.id===w.id)!;
 const e=report.shifts.find(e=>e.type==='Chip-out')!;
 assert.equal(row.cells.find(c=>c.shift===e.id)!.mark,'X');
});
