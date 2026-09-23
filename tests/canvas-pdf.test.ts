import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvasPdf,canvasPdfFilename} from '../lib/canvas-pdf.ts';
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
 assert.equal(doc.getNumberOfPages(),4);assert.deepEqual(s,before);
 assert.match(canvasPdfFilename(s,s.current),/^canvas-2026-09-25-.*-all-11x15-landscape.pdf$/);
});
test('PDF supports selected RDO groups, search, canceled records, and empty search results',()=>{
 const s=fixture();
 assert.equal(checkPhysicalPages(s,'FS').getNumberOfPages(),2);
 assert.equal(checkPhysicalPages(s,'SM','Santana').getNumberOfPages(),2);
 assert.equal(checkPhysicalPages(s,'FS','No matching worker').getNumberOfPages(),2);
 s.canvases[0].canceled=true;assert.equal(checkPhysicalPages(s).getNumberOfPages(),4);
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
