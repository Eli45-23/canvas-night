import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvasPdf,canvasPdfFilename,paperCanvasSheet} from '../lib/canvas-pdf.ts';
import {apply,seed,total,canceledHoursReturned,cancellationPreview,type State} from '../lib/engine.ts';
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

test('call-outs show R8 on time and R16 for late or missing notice without posting queued hours early',()=>{
 for(const noticeHours of [5,4,3,null]){
  let s=fixture();const e=s.shifts[0],w=s.workers[0];
  // A normal accepted assignment with a retained original eight-hour charge.
  s.responses.push({id:'callout-response',worker:w.id,shift:e.id,kind:'accept',location:e.locations[0].name,active:true});
  s.charges.push({id:'original-accept',worker:w.id,shift:e.id,response:'callout-response',kind:'Accepted',hours:8});
  s=apply(s,{type:'absence',response:'callout-response',reason:'Cannot attend',notice:noticeHours===null?'':new Date(e.start-noticeHours*3600000).toISOString()});
  const late=noticeHours===null||noticeHours<4;
  let row=paperCanvasSheet(s,s.current,'FS').rows.find(r=>r.worker.id===w.id)!;
  assert.equal(row.cells[0].mark,late?'R16\n(8 pending)':'R8');
  assert.equal(row.ending,w.starting+8);
  if(late){
   for(const shift of s.shifts)for(const location of shift.locations){
    const assigned=s.responses.filter(r=>r.shift===shift.id&&r.location===location.name&&r.active&&!r.absent&&r.kind!=='refuse').length;
    for(let i=assigned;i<location.required;i++)s=apply(s,{type:'outside',shift:shift.id,location:location.name});
   }
   s=apply(s,{type:'review'});
   row=paperCanvasSheet(s,s.current,'FS').rows.find(r=>r.worker.id===w.id)!;
   assert.equal(row.cells[0].mark,'R16');assert.equal(row.ending,w.starting+16);
  }
 }
});
test('correcting a call-out restores accepted notation, and canceled work does not retain an R16 label',()=>{
 let s=fixture();const e=s.shifts[0],w=s.workers[0];
 s.responses.push({id:'absence-response',worker:w.id,shift:e.id,kind:'accept',location:e.locations[0].name,active:true});
 s.charges.push({id:'accepted-charge',worker:w.id,shift:e.id,response:'absence-response',kind:'Accepted',hours:8});
 s=apply(s,{type:'absence',response:'absence-response',reason:'Cannot attend'});
 const canceled=apply(s,{type:'cancel',shifts:[e.id],reason:'Work withdrawn'});
 assert.equal(paperCanvasSheet(canceled,canceled.current,'FS').rows.find(r=>r.worker.id===w.id)!.cells[0].mark,'-8');
 s=apply(s,{type:'undoAbsence',id:s.adjustments[0].id,reason:'Wrong call-out'});
 assert.equal(paperCanvasSheet(s,s.current,'FS').rows.find(r=>r.worker.id===w.id)!.cells[0].mark,'8');
});


test('cancellation displays refunds for accepted and refused hours without subtracting them twice',()=>{
 let s=fixture();const e=s.shifts[0], [a,r]=s.workers;
 s.charges.push({id:'a',worker:a.id,shift:e.id,kind:'Accepted',hours:8},{id:'r',worker:r.id,shift:e.id,kind:'Refused',hours:8});
 s=apply(s,{type:'cancel',shifts:[e.id],reason:'Overtime withdrawn'});
 for(const w of [a,r]){
  const row=paperCanvasSheet(s,s.current,'FS').rows.find(r=>r.worker.id===w.id)!;
  assert.equal(row.cells[0].mark,'-8');assert.equal(row.cells[0].hours,0);
  assert.equal(row.cells[0].running,w.starting);assert.equal(total(s,w.id),w.starting);
 }
 const legacy=structuredClone(s);delete legacy.shifts[0].cancellationHours;
 assert.equal(paperCanvasSheet(legacy,legacy.current,'FS').rows[0].cells[0].mark,'-8');
 checkPhysicalPages(s);
});
test('cancellation snapshot excludes old reversals and includes only the newly returned balance',()=>{
 let s=fixture();const e=s.shifts[0],w=s.workers[0];
 s.charges.push({id:'old',worker:w.id,shift:e.id,kind:'Accepted',hours:8},
 {id:'undo',worker:w.id,shift:e.id,kind:'Reversal',hours:-8,reverses:'old'},
 {id:'new',worker:w.id,shift:e.id,kind:'Refused',hours:8});
 s=apply(s,{type:'cancel',shifts:[e.id],reason:'Withdrawn'});
 assert.equal(paperCanvasSheet(s,s.current,'FS').rows[0].cells[0].mark,'-8');
 assert.equal(s.shifts[0].cancellationHours![w.id],-8);
});
test('sheet corrections add and remove hours for any worker and shift while preserving opening hours and coverage',()=>{
 let s=fixture();const w=s.workers[0],other=s.workers[1],e=s.shifts.find(e=>e.group==='SM')!;
 const before=structuredClone(s);
 s=apply(s,{type:'correction',worker:w.id,shift:e.id,hours:8,reason:'Missing hours'});
 assert.equal(total(s,w.id),w.starting+8);assert.equal(total(s,other.id),other.starting);
 let row=paperCanvasSheet(s,s.current,'FS','',true).rows[0];
 assert.equal(row.cells.find(c=>c.shift===e.id)!.hours,8);assert.equal(row.ending,w.starting+8);
 s=apply(s,{type:'correction',worker:w.id,shift:e.id,hours:-3,reason:'Correct amount'});
 row=paperCanvasSheet(s,s.current,'FS','',true).rows[0];
 assert.equal(row.cells.find(c=>c.shift===e.id)!.hours,5);assert.equal(row.ending,w.starting+5);
 assert.equal(total(s,w.id),w.starting+5);assert.equal(row.opening,w.starting);
 assert.deepEqual(s.responses,before.responses);assert.deepEqual(s.shifts,before.shifts);
 assert.deepEqual(s.canvases[0].baseline,before.canvases[0].baseline);
 assert.match(s.history.at(-1)!.text,/Correct amount/);
 const saved=structuredClone(s);
 assert.throws(()=>apply(s,{type:'correction',worker:w.id,shift:e.id,hours:8,reason:''}));
 assert.deepEqual(s,saved);
});

test('final opening and entire canvas cancellation record refunds, including posted penalties',()=>{
 for(const mode of ['opening','cancelCanvas']){
  let s=fixture();const e=s.shifts[0],w=s.workers[0];
  e.locations=[{name:'A',required:1}];
  s.charges.push({id:'original',worker:w.id,shift:e.id,kind:'Accepted',hours:8},
   {id:'penalty',worker:w.id,shift:e.id,kind:'Absence penalty',hours:8});
  s=apply(s,mode==='opening'?{type:mode,shift:e.id,location:'A',reason:'Work withdrawn'}:{type:mode,canvas:s.current,reason:'Work withdrawn'});
  assert.equal(paperCanvasSheet(s,e.canvas,'FS').rows[0].cells[0].mark,'-16');
  assert.equal(total(s,w.id),w.starting);
 }
});


test('legacy undo, reaccept, and cancellation shows only the final refund for every worker',()=>{
 let s=fixture();const e=s.shifts[0],[a,b]=s.workers;
 s.charges.push({id:'a1',worker:a.id,shift:e.id,kind:'Accepted',hours:8},
  {id:'undo-a1',worker:a.id,shift:e.id,kind:'Reversal',hours:-8,reverses:'a1'},
  {id:'a2',worker:a.id,shift:e.id,kind:'Accepted',hours:8},
  {id:'b1',worker:b.id,shift:e.id,kind:'Refused',hours:8});
 assert.deepEqual(cancellationPreview(s,[e.id]).map(c=>c.hours),[-8,-8]);
 s=apply(s,{type:'cancel',shifts:[e.id],reason:'Withdrawn'});
 delete s.shifts[0].cancellationHours;
 const before=structuredClone(s);
 for(const w of [a,b]){
  assert.equal(canceledHoursReturned(s,s.shifts[0],w.id),-8);
  const row=paperCanvasSheet(s,s.current,'FS').rows.find(r=>r.worker.id===w.id)!;
  assert.equal(row.cells[0].mark,'-8');assert.equal(row.ending,w.starting);
 }
 checkPhysicalPages(s);assert.deepEqual(s,before);
});
test('legacy refund preserves real sixteen-hour refunds and signed corrections',()=>{
 for(const extra of [8,-3]){
  let s=fixture();const e=s.shifts[0],w=s.workers[0];
  s.charges.push({id:'original',worker:w.id,shift:e.id,kind:'Accepted',hours:8},
   {id:'extra',worker:w.id,shift:e.id,kind:extra===8?'Absence penalty':'Correction',hours:extra});
  s=apply(s,{type:'cancel',shifts:[e.id],reason:'Withdrawn'});delete s.shifts[0].cancellationHours;
  assert.equal(canceledHoursReturned(s,s.shifts[0],w.id),-(8+extra));
  assert.equal(total(s,w.id),w.starting);
 }
});
test('legacy reversal order boundary excludes an adjacent earlier undo',()=>{
 let s=fixture();const e=s.shifts[0],[a,b]=s.workers;
 s.charges.push({id:'a',worker:a.id,shift:e.id,kind:'Accepted',hours:8},
  {id:'b',worker:b.id,shift:e.id,kind:'Accepted',hours:8},
  {id:'undo-b',worker:b.id,shift:e.id,kind:'Reversal',hours:-8,reverses:'b'});
 s=apply(s,{type:'cancel',shifts:[e.id],reason:'Withdrawn'});delete s.shifts[0].cancellationHours;
 assert.equal(canceledHoursReturned(s,s.shifts[0],a.id),-8);
 assert.equal(canceledHoursReturned(s,s.shifts[0],b.id),0);
});
test('exact cancellation snapshots exclude adjacent prior undos for all cancellation paths',()=>{
 for(const mode of ['cancel','opening','cancelCanvas']){
  let s=fixture();const e=s.shifts[0],[a,b]=s.workers;
  e.locations=[{name:'A',required:1}];
  s.charges.push({id:'a',worker:a.id,shift:e.id,kind:'Accepted',hours:8},
   {id:'b',worker:b.id,shift:e.id,kind:'Refused',hours:8},
   {id:'undo-a',worker:a.id,shift:e.id,kind:'Reversal',hours:-8,reverses:'a'});
  const cmd=mode==='cancel'?{type:mode,shifts:[e.id]}:mode==='opening'?{type:mode,shift:e.id,location:'A'}:{type:mode,canvas:s.current};
  s=apply(s,{...cmd,reason:'Withdrawn'});
  assert.equal(canceledHoursReturned(s,s.shifts[0],a.id),0);
  assert.equal(canceledHoursReturned(s,s.shifts[0],b.id),-8);
  assert.equal(total(s,a.id),a.starting);assert.equal(total(s,b.id),b.starting);
 }
});
test('canceling the canvas later preserves an already canceled shift refund snapshot',()=>{
 let s=fixture();const e=s.shifts[0],w=s.workers[0];
 s.charges.push({id:'a',worker:w.id,shift:e.id,kind:'Accepted',hours:8});
 s=apply(s,{type:'cancel',shifts:[e.id],reason:'Withdrawn'});
 s=apply(s,{type:'cancelCanvas',canvas:e.canvas,reason:'Withdraw remaining work'});
 assert.equal(canceledHoursReturned(s,s.shifts[0],w.id),-8);
 assert.equal(s.charges.filter(c=>c.reverses==='a').length,1);
});
