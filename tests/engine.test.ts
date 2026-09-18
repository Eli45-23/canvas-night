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
import { seed, apply, total, canvasSheet, sheetShiftsForGroup, sheetShiftSectionsForGroup, replacementQueue, lateAvailableQueue, queue, nextShift, coverage, eligible, at, dayAdd, intervalConflict, H, parseSeniority, chipsBlocked, cancellationPreview, scheduleReviews, baselineResetPreview, SEPT_18_BASELINE, SEPT_18_ROSTER, seniorityLabel, compareSeniority, type State, type Shift } from '../lib/engine.ts';

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

test('replacement calls reoffer refusals and not-here workers, skip declines without charge and charge acceptances once',()=>{
 let s=setup(['A'],['thu']);const e=nextShift(s)!;
 const refused=queue(s,e)[0];s=apply(s,{type:'respond',shift:e.id,worker:refused.id,kind:'refuse'});
 const away=queue(s,e)[0];s=apply(s,{type:'notHere',shift:e.id,worker:away.id});
 const original=queue(s,e)[0];s=apply(s,{type:'respond',shift:e.id,worker:original.id,kind:'accept',location:'Banks'});
 const r=s.responses.find(r=>r.worker===original.id&&r.kind==='accept')!;
 s=apply(s,{type:'absence',response:r.id,reason:'Unavailable',notice:new Date(e.start-5*H).toISOString()});
 let a=s.adjustments.at(-1)!;assert(replacementQueue(s,a).some(w=>w.id===away.id));assert(replacementQueue(s,a).some(w=>w.id===refused.id));assert(!replacementQueue(s,a).some(w=>w.id===original.id));
 const first=replacementQueue(s,a)[0],before=total(s,first.id),charges=s.charges.length;
 s=apply(s,{type:'replacementRespond',adjustment:a.id,worker:first.id,kind:'decline'});a=s.adjustments.at(-1)!;
 assert.equal(total(s,first.id),before);assert.equal(s.charges.length,charges);assert(!replacementQueue(s,a).some(w=>w.id===first.id));
 assert.throws(()=>apply(s,{type:'replacementRespond',adjustment:a.id,worker:first.id,kind:'accept'}),/order changed/);
 const next=replacementQueue(s,a)[0],hours=total(s,next.id);s=apply(s,{type:'replacementRespond',adjustment:a.id,worker:next.id,kind:'accept'});
 assert.equal(total(s,next.id),hours+8);assert.equal(s.adjustments.at(-1)!.replacement,next.id);assert.equal(replacementQueue(s,s.adjustments.at(-1)!).length,0);
 assert.throws(()=>apply(s,{type:'replacementRespond',adjustment:a.id,worker:next.id,kind:'accept'}),/unfilled/);
 s=apply(s,{type:'cancel',shifts:[e.id],reason:'Canceled'});assert.equal(total(s,next.id),hours);
});

test('a refused worker can accept replacement without a false schedule warning; undo restores original coverage',()=>{
 let s=setup(['A'],['thu']),e=nextShift(s)!,w=queue(s,e)[0];
 s=apply(s,{type:'respond',shift:e.id,worker:w.id,kind:'refuse'});
 const original=queue(s,e)[0];s=apply(s,{type:'respond',shift:e.id,worker:original.id,kind:'accept',location:'Banks'});
 s=apply(s,{type:'absence',response:s.responses.at(-1)!.id,reason:'Test'});const a=s.adjustments.at(-1)!;
 s.workers.forEach(x=>{if(x.id!==w.id&&x.id!==original.id)x.active=false;});
 assert.equal(replacementQueue(s,a)[0].id,w.id);s=apply(s,{type:'replacementRespond',adjustment:a.id,worker:w.id,kind:'accept'});
 assert.equal(scheduleReviews(s).length,0);assert.equal(total(s,w.id),16);
 s=apply(s,{type:'undoAbsence',id:a.id,reason:'Corrected'});assert.equal(total(s,w.id),8);assert.equal(s.responses.find(r=>r.id===a.response)!.absent,false);
});
test('replacement list enforces schedule and status and outside coverage has no worker charge',()=>{
 let s=setup(['A'],['thu']),e=nextShift(s)!,w=queue(s,e)[0];s=apply(s,{type:'respond',shift:e.id,worker:w.id,kind:'accept',location:'Banks'});
 s=apply(s,{type:'absence',response:s.responses.at(-1)!.id,reason:'Test'});const a=s.adjustments.at(-1)!;
 assert.throws(()=>apply(s,{type:'replacementOutside',adjustment:a.id}),/eligible local/);
 s.workers.forEach(x=>{x.days=[0,1,2,3,4,5,6]});assert.equal(replacementQueue(s,a).length,0);const count=s.charges.length;
 s=apply(s,{type:'replacementOutside',adjustment:a.id});assert.equal(s.charges.length,count);assert.equal(s.responses.at(-1)!.kind,'outside');
 s=apply(s,{type:'undoAbsence',id:a.id,reason:'Corrected'});assert.equal(s.responses.at(-1)!.active,false);
});

test('replacement ranking uses current ledger hours then status then seniority',()=>{
 let s=setup(['A'],['thu']),e=nextShift(s)!,original=queue(s,e)[0];s=apply(s,{type:'respond',shift:e.id,worker:original.id,kind:'accept',location:'Banks'});
 s=apply(s,{type:'absence',response:s.responses.at(-1)!.id,reason:'Test'});const a=s.adjustments.at(-1)!;
 const ws=s.workers.filter(w=>w.id!==original.id).slice(0,4);s.workers.forEach(w=>w.active=ws.includes(w)||w.id===original.id);
 ws.forEach(w=>{w.starting=100;w.days=[];w.provisional=false;});
 Object.assign(ws[0],{seniority:1});Object.assign(ws[1],{seniority:90});Object.assign(ws[2],{seniority:2,provisional:true});Object.assign(ws[3],{seniority:3});
 s=apply(s,{type:'correction',worker:ws[0].id,shift:e.id,hours:8,reason:'Current hours test'});
 assert.deepEqual(replacementQueue(s,a).map(w=>w.id),[ws[3].id,ws[1].id,ws[2].id,ws[0].id]);
});

test('dated canvas sheet keeps opening balances and per-shift charges, including reversals',()=>{
 let s=setup(['A'],['thu','satday','sunday']);const id=s.current,e=nextShift(s)!,w=queue(s,e)[0];
 s=apply(s,{type:'respond',shift:e.id,worker:w.id,kind:'refuse'});
 let sheet=canvasSheet(s,id),row=sheet.rows.find(r=>r.worker.id===w.id)!;
 assert.equal(sheet.start,'2026-09-17');assert.equal(sheet.end,'2026-09-21');assert.equal(row.opening,w.starting);assert.equal(row.ending,w.starting+8);assert.equal(row.cells[0].entries[0].kind,'Refused');
 const originalName=w.name;s.workers.find(x=>x.id===w.id)!.name='Renamed later';assert.equal(canvasSheet(s,id).rows.find(r=>r.worker.id===w.id)!.worker.name,originalName);
 s=apply(s,{type:'canvasDate',canvas:id,date:'2026-09-15'});assert.equal(canvasSheet(s,id).canvas.canvassedOn,'2026-09-15');
 s=apply(s,{type:'cancel',shifts:[e.id],reason:'Canceled'});row=canvasSheet(s,id).rows.find(r=>r.worker.id===w.id)!;assert.equal(row.ending,w.starting);assert.equal(row.cells[0].entries.length,2);
 s.charges.push({id:'other-canvas',worker:w.id,shift:'unrelated',kind:'Accepted',hours:8});assert.equal(canvasSheet(s,id).rows.find(r=>r.worker.id===w.id)!.ending,w.starting);
});
test('material pickup can be added on any day and uses normal charges, schedule checks and cancellation',()=>{
 let s=setup(['A'],[]);s.shifts.forEach(e=>{e.canceled=true;e.closed=true;});
 const command={type:'extraShift',canvas:s.current,workType:'Material pickup',date:'2026-09-23',hour:6,required:2,location:'Yard'};
 s=apply(s,command);const e=nextShift(s)!;assert.equal(e.type,'Material pickup');assert.equal(e.group,undefined);assert.equal(canvasSheet(s,s.current).end,'2026-09-23');
 const w=queue(s,e)[0],before=total(s,w.id);s=apply(s,{type:'respond',shift:e.id,worker:w.id,kind:'accept',location:'Yard'});assert.equal(total(s,w.id),before+8);
 const r=queue(s,e)[0],hours=total(s,r.id);s=apply(s,{type:'respond',shift:e.id,worker:r.id,kind:'refuse'});assert.equal(total(s,r.id),hours+8);
 assert.throws(()=>apply(s,command),/already listed/);s=apply(s,{type:'cancel',shifts:[e.id],reason:'Canceled pickup'});assert.equal(total(s,w.id),before);assert.equal(total(s,r.id),hours);
 s=apply(s,{...command,workType:'Banks',date:'2026-09-24'});assert.equal(s.shifts.at(-1)!.end-s.shifts.at(-1)!.start,8*H);
});


function baselineRosterState(): State {
    const s=seed(),templates=s.workers.map(w=>structuredClone(w));
    s.workers=SEPT_18_BASELINE.map((target,i)=>{
        const template=templates[i%templates.length];
        return {
            ...template,
            id:`real-${i+1}`,
            name:target.name,
            starting:100+i,
            seniority:500+i,
            provisional:i%4===0,
            rdo:target.rdo,
            days:target.rdo==='FS'?[0,1,2,3,6]:[1,2,3,4,5],
            overrides:[{date:'2026-09-30',work:i%2===0}],
            active:i%6!==0,
        };
    });
    const shiftId='old-shift',canvasId='old-canvas',workerId=s.workers[0].id;
    s.shifts=[{id:shiftId,canvas:canvasId,type:'Chip-out',start:at('2026-09-18',22),end:at('2026-09-19',6),locations:[{name:'A',required:2}],closed:false,canceled:false}];
    s.responses=[{id:'old-response',worker:workerId,shift:shiftId,kind:'accept',location:'A',active:true}];
    s.charges=[{id:'old-charge',worker:workerId,shift:shiftId,response:'old-response',kind:'Accepted',hours:8}];
    s.adjustments=[{id:'old-adjustment',worker:workerId,shift:shiftId,response:'old-response',notice:'',reason:'test',replacement:'',penalty:true,applied:false,canceled:false}];
    s.canvases=[{id:canvasId,date:'2026-09-18',reviewed:false,baseline:Object.fromEntries(s.workers.map(w=>[w.id,w.starting]))}];
    s.current=canvasId;s.reviewed=true;
    s.history=[{id:'old-history',at:'2026-09-18T12:00:00.000Z',text:'Old activity'}];
    s.reviews=[{id:'old-review',text:'Review me',resolved:false,responseIds:['old-response']}];
    s.notHere=[{id:'old-away',worker:s.workers[1].id,canvas:canvasId,shift:shiftId,active:true,responseCount:1}];
    s.replacementCalls=[{id:'old-call',adjustment:'old-adjustment',worker:s.workers[2].id,kind:'decline'}];
    return s;
}

test('Sept. 18 baseline reset archives old activity, preserves roster metadata, and sets all 42 totals exactly',()=>{
    const s=baselineRosterState(),before=structuredClone(s);
    const metadata=new Map(s.workers.map(w=>[w.name,{id:w.id,name:w.name,seniority:w.seniority,provisional:w.provisional,rdo:w.rdo,days:structuredClone(w.days),overrides:structuredClone(w.overrides),active:w.active}]));
    const preview=baselineResetPreview(s);assert.equal(preview.errors.length,0);assert.equal(preview.rows.length,42);
    const next=apply(s,{type:'resetRosterBaseline'});
    assert.equal(next.workers.length,42);
    for(const target of SEPT_18_BASELINE){
        const w=next.workers.find(w=>w.name===target.name)!;
        assert(w,`missing ${target.name}`);
        assert.equal(total(next,w.id),target.hours);
        assert.deepEqual({id:w.id,name:w.name,seniority:w.seniority,provisional:w.provisional,rdo:w.rdo,days:w.days,overrides:w.overrides,active:w.active},metadata.get(target.name));
    }
    assert.deepEqual(next.shifts,[]);assert.deepEqual(next.responses,[]);assert.deepEqual(next.charges,[]);
    assert.deepEqual(next.adjustments,[]);assert.deepEqual(next.canvases,[]);assert.equal(next.current,'');
    assert.deepEqual(next.reviews,[]);assert.deepEqual(next.notHere,[]);assert.deepEqual(next.replacementCalls,[]);
    assert.equal(next.reviewed,false);assert.equal(next.history.length,1);assert.match(next.history[0].text,/42 workers/);
    assert.deepEqual(next.baselineResetArchive!.state,before);assert.deepEqual(s,before);
    assert.throws(()=>apply(next,{type:'resetRosterBaseline'}),/already applied/);
});

test('Sept. 18 baseline reset is all-or-nothing for missing, duplicate, extra, and mismatched RDO workers',()=>{
    for(const mutate of [
        (s:State)=>{s.workers[0].name='A. Polyakoff';},
        (s:State)=>{s.workers[1].name=s.workers[0].name;},
        (s:State)=>{s.workers.push({...structuredClone(s.workers[0]),id:'extra-worker',name:'Extra Worker'});},
        (s:State)=>{s.workers[0].rdo='SM';},
    ]){
        const s=baselineRosterState();mutate(s);const before=structuredClone(s);
        assert(baselineResetPreview(s).errors.length>0);
        assert.throws(()=>apply(s,{type:'resetRosterBaseline'}));
        assert.deepEqual(s,before);
    }
});


test('real Sept. 18 roster loader replaces all sample data with the exact 42-worker source roster and archives the sample state',()=>{
    let s=setup(['A'],['thu']);
    const e=nextShift(s)!,w=queue(s,e)[0];
    s=apply(s,{type:'respond',shift:e.id,worker:w.id,kind:'refuse'});
    const before=structuredClone(s);
    const next=apply(s,{type:'loadSept18Roster'});
    assert.deepEqual(next.sampleArchive!.state,before);
    assert.equal(next.sampleArchive!.source,'Shop overtime starting-hour sheets for September 18–21, 2026');
    assert.equal(next.workers.length,42);
    assert.deepEqual(next.shifts,[]);assert.deepEqual(next.responses,[]);assert.deepEqual(next.charges,[]);
    assert.deepEqual(next.adjustments,[]);assert.deepEqual(next.canvases,[]);assert.equal(next.current,'');assert.equal(next.reviewed,false);
    for(const target of SEPT_18_ROSTER){
        const worker=next.workers.find(w=>w.name===target.name);
        assert(worker,`missing ${target.name}`);
        assert.equal(total(next,worker.id),target.hours);
        assert.equal(worker.rdo,target.rdo);
        assert.equal(seniorityLabel(worker),target.seniority);
        assert.deepEqual(worker.days,target.rdo==='FS'?[0,1,2,3,6]:[1,2,3,4,5]);
        assert.deepEqual(worker.overrides,[]);
        assert.equal(worker.active,true);
    }
    const raffee=next.workers.find(w=>w.name==='A. Raffee')!;
    assert.equal(raffee.seniorityMissing,undefined);
    assert.equal(raffee.provisional,true);
    assert.equal(seniorityLabel(raffee),'300P');
    assert.equal(total(next,raffee.id),640);
    assert.equal(next.workers.some(w=>w.name==='A. Majer CDL'),false);
    const sm=[...next.workers.filter(w=>w.rdo==='SM')].sort(compareSeniority);
    assert.deepEqual(sm.map(w=>seniorityLabel(w)),['63','115','119','133','168','169','182','186','188','189','196','230','233','248','268','42P','50P','113P','134P','180P','300P']);
    assert.equal(sm.at(-1)!.name,'A. Raffee');
    assert.throws(()=>apply(next,{type:'loadSept18Roster'}),/only replace the untouched sample roster/);
});

test('missing seniority can be recorded without inventing a number and sorts after known seniority',()=>{
    const missing=parseSeniority('—'),known=parseSeniority('42P');
    assert.equal(missing.seniorityMissing,true);
    assert.equal(seniorityLabel(missing),'—');
    assert(compareSeniority(known,missing)<0);
});


test('canvas sheet print sections preserve visible shift order and cap each section at four shifts',()=>{
    let s=setup(['A'],['thu','fri','satday','sat','sunday','sun']);
    const id=s.current;
    for(const group of ['FS','SM']){
        const visible=sheetShiftsForGroup(s,id,group);
        const sections=sheetShiftSectionsForGroup(s,id,group,4);
        assert(sections.every(section=>section.length>=1&&section.length<=4));
        assert.deepEqual(sections.flat().map(e=>e.id),visible.map(e=>e.id));
        assert.equal(new Set(sections.flat().map(e=>e.id)).size,visible.length);
        if(visible.length>4)assert(sections.length>1);
    }
    assert.throws(()=>sheetShiftSectionsForGroup(s,id,'FS',0),/1–8/);
    assert.throws(()=>sheetShiftSectionsForGroup(s,id,'FS',9),/1–8/);
});


test('Sept. 18 paper roster uses the exact photographed starting hours and excludes former worker A. Majer',()=>{
    const expected=[
      ['11P','A. Polyakov',544,'FS'],['18P','G. Campbell',561,'FS'],['41P','L. C. Bibby',489,'FS'],
      ['54P','R. Simon',618,'FS'],['56P','C. Perez',568,'FS'],['70P','P. Sohan',617,'FS'],
      ['96P','J. Valle',610,'FS'],['97P','S. Matthews',536,'FS'],['99P','J. Holley',626,'FS'],
      ['125P','L. Santos',518,'FS'],['146P','B. Shivpaul CDL',592,'FS'],['147P','S. Lewis',608,'FS'],
      ['164P','D. Gabriel',550,'FS'],['169P','G. Mendonca',598,'FS'],['173P','L. Gittens',602,'FS'],
      ['192P','J. Hamilton CDL',622,'FS'],['193P','E. Maloski CDL',608,'FS'],['197P','A. Urbina',624,'FS'],
      ['202P','J. Davilla',609,'FS'],['203P','J. Burke',617,'FS'],['204P','K. Felix',625,'FS'],
      ['63','T. Codrington',632,'SM'],['115','B. Santana',590,'SM'],['119','M. Mohan',638,'SM'],
      ['133','R. Metoo',651,'SM'],['168','V. Campbell',644,'SM'],['169','N. Cottone',608,'SM'],
      ['182','D. Champagnie',586,'SM'],['186','E. Colon',616,'SM'],['188','B. Mistry',582,'SM'],
      ['189','E. Lawes',642,'SM'],['196','D. Ahel',632,'SM'],['230','B. Green',650,'SM'],
      ['233','W. Gordon',602,'SM'],['248','J. Quin',610,'SM'],['268','J. Prince',657,'SM'],
      ['42P','C. Allen CDL',656,'SM'],['50P','A. Stadnyk CDL',620,'SM'],['113P','T. Vidal',599,'SM'],
      ['134P','P. Wessels CDL',599,'SM'],['180P','D. Martinez',606,'SM'],['300P','A. Raffee',640,'SM'],
    ];
    assert.equal(SEPT_18_ROSTER.length,42);
    assert.deepEqual(SEPT_18_ROSTER.map(w=>[w.seniority,w.name,w.hours,w.rdo]),expected);
    assert.equal(SEPT_18_ROSTER.map(w=>String(w.name)).includes('A. Majer CDL'),false);
});


test('late availability lets a Not here worker fill any still-open coverage later for +8 while retaining the Not here audit record',()=>{
    let s=setup(['A'],['thu']);
    const e=nextShift(s)!,away=queue(s,e)[0],before=total(s,away.id);
    s=apply(s,{type:'notHere',shift:e.id,worker:away.id});
    assert.equal(total(s,away.id),before);
    assert.equal(s.notHere!.find(n=>n.worker===away.id)!.active,true);
    assert.equal(s.shifts.find(x=>x.id===e.id)!.closed,false);
    assert.equal(lateAvailableQueue(s,s.shifts.find(x=>x.id===e.id)!).some(w=>w.id===away.id),true);
    const remaining=coverage(s,s.shifts.find(x=>x.id===e.id)!,'Banks').remaining;
    s=apply(s,{type:'lateAvailabilityAssign',shift:e.id,location:'Banks',worker:away.id});
    assert.equal(total(s,away.id),before+8);
    assert.equal(coverage(s,s.shifts.find(x=>x.id===e.id)!,'Banks').remaining,remaining-1);
    assert.equal(s.notHere!.find(n=>n.worker===away.id)!.active,true);
    const r=s.responses.findLast(r=>r.worker===away.id&&r.shift===e.id)!;
    assert.equal(r.kind,'accept');assert.equal(r.location,'Banks');assert.equal(r.active,true);
    assert.equal(s.charges.filter(c=>c.response===r.id).reduce((n,c)=>n+c.hours,0),8);
    assert.match(s.history.at(-1)!.text,/late availability accepted/);
    assert.match(s.history.at(-1)!.text,/Original Not here record retained/);
    const row=canvasSheet(s,s.current).rows.find(row=>row.worker.id===away.id)!;
    assert.equal(row.cells.find(cell=>cell.shift===e.id)!.entries.some(entry=>entry.kind==='Accepted'&&entry.hours===8),true);
    assert.equal(lateAvailableQueue(s,s.shifts.find(x=>x.id===e.id)!).some(w=>w.id===away.id),false);
});

test('late availability enforces open coverage, RDO, duplicate-shift and work-rest eligibility',()=>{
    let s=setup(['A'],['thu']);
    const e=nextShift(s)!,away=queue(s,e)[0];
    s=apply(s,{type:'notHere',shift:e.id,worker:away.id});
    s.workers.forEach(w=>{if(w.id!==away.id)w.active=false;});
    s=apply(s,{type:'shortage',shift:e.id});
    const closed=s.shifts.find(x=>x.id===e.id)!;
    assert(lateAvailableQueue(s,closed).some(w=>w.id===away.id));
    const wrongRdo=structuredClone(s);wrongRdo.workers.find(w=>w.id===away.id)!.rdo='SM';
    assert.equal(lateAvailableQueue(wrongRdo,wrongRdo.shifts.find(x=>x.id===e.id)!).some(w=>w.id===away.id),false);
    const conflict=structuredClone(s);conflict.workers.find(w=>w.id===away.id)!.days=[0,1,2,3,4,5,6];
    assert.equal(lateAvailableQueue(conflict,conflict.shifts.find(x=>x.id===e.id)!).some(w=>w.id===away.id),false);
    s=apply(s,{type:'lateAvailabilityAssign',shift:e.id,location:'Banks',worker:away.id});
    assert.throws(()=>apply(s,{type:'lateAvailabilityAssign',shift:e.id,location:'Banks',worker:away.id}),/no longer eligible|no longer has an open position/);
    assert.throws(()=>apply(s,{type:'lateAvailabilityAssign',shift:e.id,location:'No such location',worker:away.id}),/valid location/);
});

test('late availability uses any active Not here record from the same canvas, including for an earlier coverage-needed shift',()=>{
    let s=setup(['A'],['thu','fri']);
    const shifts=currentShifts(s),first=shifts[0],later=shifts.at(-1)!,worker=s.workers.find(w=>w.rdo===first.group)!;
    (s.notHere ||= []).push({id:'later-away',worker:worker.id,canvas:first.canvas,shift:later.id,active:true,responseCount:s.responses.length});
    assert.equal(lateAvailableQueue(s,first).some(w=>w.id===worker.id),true);
    const other=structuredClone(s);
    other.notHere![0].canvas='different-canvas';
    assert.equal(lateAvailableQueue(other,other.shifts.find(x=>x.id===first.id)!).some(w=>w.id===worker.id),false);
});
