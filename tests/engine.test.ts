import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Not here skips the worker for every shift of only that canvas with no hours or coverage change',()=>{
    let s=setup(['A'],['thu','fri','sat','sun']);const e=nextShift(s)!,w=queue(s,e)[0];
    const before=s.workers.map(w=>total(s,w.id));s=apply(s,{type:'notHere',shift:e.id,worker:w.id});
    assert.deepEqual(s.workers.map(w=>total(s,w.id)),before);assert.equal(s.charges.length,0);assert.equal(s.responses.length,0);
    assert.equal(coverage(s,e).assigned,0);assert.notEqual(queue(s,e)[0].id,w.id);
    assert(s.shifts.every(e=>!queue(s,e).some(x=>x.id===w.id)));
    assert.equal(eligible(s,w,{...e,canvas:'next-week'}),'');
    const restored=JSON.parse(JSON.stringify(s));assert(!queue(restored,e).some(x=>x.id===w.id));
    assert.throws(()=>apply(s,{type:'notHere',shift:e.id,worker:w.id}),/next worker/);
});
test('undo handles several Not here entries and responses in reverse order without altering skipped workers hours',()=>{
    let s=setup(),e=nextShift(s)!;const first=queue(s,e)[0];s=apply(s,{type:'notHere',shift:e.id,worker:first.id});
    const second=queue(s,e)[0];s=apply(s,{type:'notHere',shift:e.id,worker:second.id});
    const third=queue(s,e)[0];s=respond(s,'refuse');s=apply(s,{type:'undo'});
    assert.equal(total(s,third.id),third.starting);assert.equal(s.notHere!.filter(n=>n.active).length,2);
    s=apply(s,{type:'undo'});assert.equal(queue(s,e)[0].id,second.id);assert.equal(s.notHere!.filter(n=>n.active).length,1);
    s=apply(s,{type:'undo'});assert.equal(queue(s,e)[0].id,first.id);assert.equal(total(s,first.id),first.starting);
});
test('canceling the shift where Not here was recorded does not bring that worker back in the same canvas',()=>{
    let s=setup(),e=nextShift(s)!,w=queue(s,e)[0];s=apply(s,{type:'notHere',shift:e.id,worker:w.id});
    s=apply(s,{type:'cancel',shifts:[e.id],reason:'Work withdrawn'});
    assert(s.notHere![0].active);assert(s.shifts.every(e=>!queue(s,e).some(x=>x.id===w.id)));assert.equal(total(s,w.id),w.starting);
});
test('Not here retains earlier assignments and charges for the same worker',()=>{
    let s=setup(['A']);s=respond(s);const assignment=s.responses[0],w=s.workers.find(w=>w.id===assignment.worker)!;
    s=respond(s);const e=nextShift(s)!;s.workers.forEach(x=>{if(x.id!==w.id)x.starting+=1000;});
    assert.equal(queue(s,e)[0].id,w.id);const before=total(s,w.id);s=apply(s,{type:'notHere',shift:e.id,worker:w.id});
    assert(s.responses.find(r=>r.id===assignment.id)!.active);assert.equal(total(s,w.id),before);
    assert.equal(eligible(s,w,s.shifts[0],assignment.id),'');
});
import { seed, apply, total, queue, nextShift, coverage, eligible, at, dayAdd, intervalConflict, H, parseSeniority, chipsBlocked, cancellationPreview, type State, type Shift } from '../lib/engine.ts';

test('correct a refusal to acceptance without charging twice or reshuffling other responses',()=>{
    let s=setup(); s=respond(s,'refuse'); const first=s.responses[0]; s=respond(s);
    const later=s.responses[1];
    s=apply(s,{type:'correct',response:first.id,kind:'accept',location:'A',reason:'Wrong button'});
    assert.equal(total(s,first.worker),8);assert.equal(coverage(s,s.shifts[0]).assigned,2);
    assert(s.responses.find(r=>r.id===later.id)?.active);assert(s.reviews.length>0);
});
test('correcting an absence reverses its replacement and restores one original position',()=>{
    let s=prior(undefined,'sample-2');s=apply(s,{type:'review'});
    s=apply(s,{type:'undoAbsence',id:s.adjustments[0].id,reason:'Incorrect absence'});
    assert.equal(total(s,'sample-1'),8);assert.equal(total(s,'sample-2'),0);
    assert.equal(coverage(s,s.shifts[0]).assigned,1);assert.equal(s.responses[0].absent,false);
});
test('canceling a covered opening reverses the absent worker, penalty, and replacement',()=>{
    let s=prior(undefined,'sample-2');s.shifts[0].locations[0].required=2;s=apply(s,{type:'review'});
    s=apply(s,{type:'opening',shift:s.shifts[0].id,location:'Prior assignment',response:s.responses[1].id,reason:'Opening canceled'});
    assert.equal(total(s,'sample-1'),0);assert.equal(total(s,'sample-2'),0);
    assert.equal(s.shifts[0].locations[0].required,1);assert.equal(s.adjustments[0].canceled,true);
});
test('replacement hours already included in starting total are not duplicated',()=>{
    let s=seed();s.workers[1].starting=24;s=apply(s,{type:'prior',worker:'sample-1',key:'import',date:'2026-09-11',hour:22,reason:'Prior paper record'});
    s=apply(s,{type:'absence',response:s.responses[0].id,replacement:'sample-2',replacementIncluded:true,reason:'No notice'});
    assert.equal(total(s,'sample-2'),24);
    s=apply(s,{type:'undoAbsence',id:s.adjustments[0].id,reason:'Wrong replacement'});
    assert.equal(total(s,'sample-2'),24);assert.equal(s.workers[1].starting,24);
});
test('correcting an imported charge restores reclassified starting hours',()=>{
    let s=seed();s.workers[0].starting=24;s=apply(s,{type:'prior',worker:'sample-1',key:'import',date:'2026-09-11',hour:22,alreadyIncluded:true,reason:'Prior record'});
    s=apply(s,{type:'correct',response:s.responses[0].id,reason:'Wrong prior record'});
    assert.equal(total(s,'sample-1'),24);assert.equal(s.workers[0].starting,24);
});
test('queued penalties cannot change an in-progress canvas',()=>{
    const s=setup();assert.throws(()=>apply(s,{type:'review'}),/Finish local/);
});
test('unrelated historical violations do not block a rested new assignment',()=>{
    assert.equal(intervalConflict([iv(0,24)],iv(72,80)),'');
});
test('full 46-worker canvas finishes with accurate local and outside coverage',()=>{
    let s=setup(['A','B','C','D','E'],['thu','fri','satday','sat','sunday','sun']);let offers=0;
    for(let guard=0;guard<1000;guard++){
        const e=nextShift(s);if(!e)break;
        if(chipsBlocked(s,e)){
            for(const chip of s.shifts.filter(x=>x.type==='Chip-out'&&!x.canceled))for(const l of chip.locations)while(coverage(s,chip,l.name).remaining>0)s=apply(s,{type:'outside',shift:chip.id,location:l.name});
        }else if(queue(s,e).length){s=respond(s,offers++%4===0?'refuse':'accept');}
        else s=apply(s,{type:'shortage',shift:e.id});
    }
    assert(!nextShift(s));assert(s.shifts.filter(e=>e.type==='Chip-out').every(e=>coverage(s,e).remaining===0));
    assert.equal(s.charges.reduce((n,c)=>n+c.hours,0),offers*8);
    assert(s.shifts.every(e=>coverage(s,e).remaining>=0));
    for(const r of s.responses.filter(r=>r.kind==='accept'))assert.equal(eligible(s,s.workers.find(w=>w.id===r.worker)!,s.shifts.find(e=>e.id===r.shift)!,r.id),'');
});
function setup(locations = ['A', 'B'], banks: string[] = []) { return apply(apply(seed(), { type: 'review' }), { type: 'setup', date: '2026-09-18', locations, banks }); }
function respond(s: State, kind = 'accept') { const e = nextShift(s)!; return apply(s, { type: 'respond', shift: e.id, worker: queue(s, e)[0].id, kind, location: e.locations.find(l => coverage(s, e, l.name).remaining > 0)!.name }); }
function shift(date: string, hour: number): Shift { return { id: 'test', canvas: 'test', type: 'Chip-out', start: at(date, hour), end: at(hour === 22 ? dayAdd(date, 1) : date, hour === 22 ? 6 : hour + 8), locations: [{ name: 'A', required: 2 }], closed: false, canceled: false }; }
const iv = (start: number, end: number) => ({ start: start * H, end: end * H, source: 'test' });
test('46 clearly labeled sample workers with unique seniority', () => { const s = seed(); assert.equal(s.workers.length, 46); assert.equal(new Set(s.workers.map(w => w.seniority)).size, 46); assert(s.workers.every(w => w.name.startsWith('Sample Worker'))); });
test('both provisional number forms and permanent-before-provisional ordering', () => { assert.deepEqual(parseSeniority('100P'), parseSeniority('P100')); let s = setup(); s.workers = s.workers.slice(0, 3); Object.assign(s.workers[0], { seniority: 100, starting: 0, provisional: false }); Object.assign(s.workers[1], { seniority: 15, starting: 0, provisional: true }); Object.assign(s.workers[2], { seniority: 10, starting: 0, provisional: true }); assert.deepEqual(queue(s, nextShift(s)!).map(w => w.seniority), [100, 10, 15]); });
test('acceptance and refusal both reorder across entire eligible list', () => { for (const kind of ['accept', 'refuse']) {
    let s = setup();
    const e = nextShift(s)!, w = queue(s, e)[0];
    s = respond(s, kind);
    assert.equal(total(s, w.id), 8);
    assert.equal(total(s, queue(s, e)[0].id), 0);
    assert.notEqual(queue(s, e)[0].id, w.id);
} });
test('one refusal per shift across all locations; nobody unreached or ineligible is charged', () => { let s = setup(); const e = nextShift(s)!, w = queue(s, e)[0]; s = respond(s, 'refuse'); assert.equal(s.charges.length, 1); assert.equal(s.charges[0].worker, w.id); assert(!queue(s, e).some(x => x.id === w.id)); assert.throws(() => apply(s, { type: 'respond', shift: e.id, worker: w.id, kind: 'refuse' })); assert(!s.charges.some(c => s.workers.find(w => w.id === c.worker)?.rdo === 'SM')); });
test('never overfill locations; refusals do not provide coverage', () => { let s = setup(['A']); const e = nextShift(s)!; s = respond(s, 'refuse'); assert.equal(coverage(s, e).assigned, 0); s = respond(s); s = respond(s); assert.equal(coverage(s, e).assigned, 2); assert.notEqual(nextShift(s)?.id, e.id); assert.throws(() => apply(s, { type: 'respond', shift: e.id, worker: 'sample-4', kind: 'accept', location: 'A' })); });
test('five locations require 70 chip-out positions', () => { const s = setup(['A', 'B', 'C', 'D', 'E']); assert.equal(s.shifts.reduce((a, e) => a + coverage(s, e).required, 0), 70); });
test('mandatory banks / chip-out ordering and group restrictions', () => { const s = setup(['A'], ['thu', 'fri', 'satday', 'sat', 'sunday', 'sun']); assert.equal(s.shifts.length, 13); assert.equal(s.shifts[0].group, 'FS'); assert(s.shifts.slice(1, 8).every(e => e.type === 'Chip-out')); assert.deepEqual(s.shifts.slice(8).map(e => e.group || 'any'), ['FS', 'any', 'SM', 'any', 'SM']); assert(s.shifts.filter(e => e.type === 'Banks').every(e => coverage(s, e).required === 18)); });
test('regular interval conflicts for both RDO groups', () => { const s = seed(), fs = s.workers[0], sm = s.workers[23]; assert.equal(eligible(s, fs, shift('2026-09-18', 22)), ''); assert.match(eligible(s, sm, shift('2026-09-18', 22)), /Overlaps/); for (const date of ['2026-09-19', '2026-09-20'])
    assert.match(eligible(s, fs, shift(date, 22)), /Overlaps/); assert.equal(eligible(s, sm, shift('2026-09-19', 22)), ''); assert.equal(eligible(s, sm, shift('2026-09-20', 22)), ''); });
test('sixteen-hour limit, rest across midnight, and future work checked', () => { assert.equal(intervalConflict([iv(22, 30)], iv(14, 22)), ''); assert.match(intervalConflict([iv(14, 22), iv(22, 30)], iv(30, 38)), /sixteen/); assert.match(intervalConflict([iv(14, 30)], iv(34, 42)), /Eight hours/); assert.equal(intervalConflict([iv(14, 30)], iv(38, 46)), ''); assert.match(intervalConflict([iv(30, 38)], iv(14, 30)), /sixteen/); assert.match(intervalConflict([iv(34, 42)], iv(14, 30)), /Eight hours/); });
test('refusal has no actual-work interval; accepted future assignments do', () => { const s = seed(), w = s.workers[0]; w.days = []; const earlier = shift('2026-09-19', 6), later = shift('2026-09-19', 14); s.shifts.push(earlier, later); earlier.id = 'early'; later.id = 'late'; s.responses.push({ id: 'r', worker: w.id, shift: earlier.id, kind: 'refuse', location: '', active: true }); assert.equal(eligible(s, w, later), ''); assert.equal(coverage(s, earlier).assigned, 0); });
test('dated regular schedule exceptions override weekday templates', () => { const s = seed(), w = s.workers[0]; w.overrides = [{ date: '2026-09-19', work: false }, { date: '2026-09-18', work: true }]; assert.equal(eligible(s, w, shift('2026-09-19', 22)), ''); assert.match(eligible(s, w, shift('2026-09-18', 22)), /Overlaps/); });
test('all chip-out shortages lock later banks until outside positions secured', () => { let s = setup(['A'], ['fri']); s.workers.forEach(w => w.active = false); for (let i = 0; i < 7; i++)
    s = apply(s, { type: 'shortage', shift: nextShift(s)!.id }); const bank = nextShift(s)!; assert(chipsBlocked(s, bank)); for (const e of s.shifts.filter(e => e.type === 'Chip-out')) {
    s = apply(s, { type: 'outside', shift: e.id, location: 'A' });
    s = apply(s, { type: 'outside', shift: e.id, location: 'A' });
} assert(!chipsBlocked(s, bank)); assert.equal(s.charges.length, 0); assert(s.responses.every(r => r.worker === '')); assert.throws(() => apply(s, { type: 'outside', shift: s.shifts[0].id, location: 'A' })); });
test('same-time banks and chip-outs can each have a refusal charge', () => { let s = setup(['A'], ['fri']); s.workers = s.workers.slice(0, 1); s = respond(s, 'refuse'); for (let i = 0; i < 7; i++) {
    const e = nextShift(s)!;
    while (queue(s, e).length)
        s = respond(s, 'refuse');
    s = apply(s, { type: 'shortage', shift: e.id });
    s = apply(s, { type: 'outside', shift: e.id, location: 'A' });
    s = apply(s, { type: 'outside', shift: e.id, location: 'A' });
} const bank = nextShift(s)!; assert.equal(bank.type, 'Banks'); s = respond(s, 'refuse'); const simultaneous = s.charges.filter(c => s.shifts.find(e => e.id === c.shift)?.start === bank.start); assert.equal(simultaneous.length, 2); assert.equal(simultaneous.reduce((a, c) => a + c.hours, 0), 16); });
function prior(notice?: string, replacement?: string, included = false) { let s = seed(); s = apply(s, { type: 'prior', worker: 'sample-1', key: 'last-week-1', date: '2026-09-11', hour: 22, alreadyIncluded: included, reason: 'Paper record' }); return apply(s, { type: 'absence', response: s.responses[0].id, notice, reason: 'Missed assignment', replacement }); }
test('late penalty deferred until review and applied once', () => { let s = prior(); assert.equal(total(s, 'sample-1'), 8); assert.equal(s.adjustments[0].applied, false); s = apply(s, { type: 'review' }); assert.equal(total(s, 'sample-1'), 16); s = apply(s, { type: 'review' }); assert.equal(total(s, 'sample-1'), 16); assert.throws(() => apply(s, { type: 'absence', response: s.responses[0].id, reason: 'duplicate' })); assert(s.responses[0].absent); });
test('four hours notice retains original charge without penalty', () => { let s = prior(new Date(at('2026-09-11', 18)).toISOString()); s = apply(s, { type: 'review' }); assert.equal(total(s, 'sample-1'), 8); assert.equal(s.adjustments[0].penalty, false); });
test('replacement adds eight exactly once and counts as work', () => { let s = prior(undefined, 'sample-2'); assert.equal(total(s, 'sample-2'), 8); assert.equal(s.responses.filter(r => r.worker === 'sample-2' && r.kind === 'accept').length, 1); s = apply(s, { type: 'review' }); s = apply(s, { type: 'review' }); assert.equal(total(s, 'sample-2'), 8); const w = s.workers[1]; assert.match(eligible(s, w, shift('2026-09-11', 22)), /Overlaps/); });
test('original charge already in starting hours is reclassified, not duplicated', () => { let s = seed(); s.workers[0].starting = 24; s = apply(s, { type: 'prior', worker: 'sample-1', key: 'old', date: '2026-09-11', hour: 22, alreadyIncluded: true, reason: 'Imported' }); assert.equal(total(s, 'sample-1'), 24); assert.equal(s.workers[0].starting, 16); s = apply(s, { type: 'cancel', shifts: [s.shifts[0].id], reason: 'Work canceled' }); assert.equal(total(s, 'sample-1'), 16); });
test('undo reverses charge, restores eligibility, and preserves audit', () => { let s = setup(); const e = nextShift(s)!; s = respond(s, 'refuse'); s = apply(s, { type: 'undo' }); assert.equal(total(s, 'sample-1'), 0); assert.equal(queue(s, e)[0].id, 'sample-1'); assert.equal(s.responses.length, 1); assert.equal(s.responses[0].active, false); assert.equal(s.charges.length, 2); assert(s.history.some(h => h.text.includes('Undid'))); });
test('cancel reverses accepted, refused and applied or queued absence charges', () => { for (const applied of [false, true]) {
    let s = prior(undefined, 'sample-2');
    if (applied)
        s = apply(s, { type: 'review' });
    const id = s.shifts[0].id;
    const changes = cancellationPreview(s, [id]);
    assert.equal(changes.reduce((a, c) => a + c.hours, 0), applied ? -24 : -16);
    s = apply(s, { type: 'cancel', shifts: [id], reason: 'Work withdrawn' });
    s = apply(s, { type: 'review' });
    assert.equal(total(s, 'sample-1'), 0);
    assert.equal(total(s, 'sample-2'), 0);
    assert(s.responses.every(r => !r.active));
    assert(s.adjustments.every(a => a.canceled));
    assert.throws(() => apply(s, { type: 'cancel', shifts: [id], reason: 'duplicate' }));
} });
test('single opening cancellation reduces capacity and reverses its acceptance', () => { let s = setup(['A']); s = respond(s); const r = s.responses[0], e = s.shifts[0]; s = apply(s, { type: 'opening', shift: e.id, location: 'A', response: r.id, reason: 'One position withdrawn' }); assert.equal(coverage(s, s.shifts[0]).required, 1); assert.equal(coverage(s, s.shifts[0]).assigned, 0); assert.equal(total(s, r.worker), 0); });
test('seniority is unique within status; permanent and provisional numbers may match', () => { const s = seed(), w = s.workers[0]; assert.throws(() => apply(s, { ...w, type: 'worker', seniority: '2' }), /unique/); assert.equal(apply(s, { ...w, type: 'worker', seniority: 'P2' }).workers[0].provisional, true); });
test('weekend date validation and repeat canvas protection', () => { assert.throws(() => apply(apply(seed(), { type: 'review' }), { type: 'setup', date: '2026-09-19', locations: ['A'] }), /Friday/); });
test('New York daylight saving uses actual elapsed intervals', () => { assert.equal((at('2026-11-01', 6) - at('2026-10-31', 22)) / H, 9); assert.equal((at('2026-03-08', 6) - at('2026-03-07', 22)) / H, 7); });

test('sample replacement archives all old activity without carrying charges into imported balances', () => {
 let s=setup();const e=nextShift(s)!,w=queue(s,e)[0];s=apply(s,{type:'respond',shift:e.id,worker:w.id,kind:'refuse'});
 const before=structuredClone(s); const command={type:'replaceSamples',source:'Test roster',workers:[{name:'Real worker',seniority:'P300',starting:664,rdo:'SM',days:[1,2,3,4,5],overrides:[],active:true}]};
 const next=apply(s,command);assert.deepEqual(next.sampleArchive!.state,before);assert.deepEqual(s,before);assert.equal(next.workers.length,1);assert.equal(total(next,next.workers[0].id),664);assert.equal(next.charges.length,0);assert.equal(next.responses.length,0);assert.equal(next.canvases.length,0);assert.equal(next.current,'');assert.equal(next.workers[0].seniority,300);assert.throws(()=>apply(next,command),/sample roster/);
 assert.throws(()=>apply(s,{...command,workers:[...command.workers,...command.workers]}),/unique/);assert.deepEqual(s,before);
});
