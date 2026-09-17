// Pure scheduling and accounting engine, shared by the UI and authoritative API.
export type Worker = {
    id: string;
    name: string;
    starting: number;
    seniority: number;
    provisional: boolean;
    rdo: string;
    days: number[];
    overrides: {
        date: string;
        work: boolean;
    }[];
    active: boolean;
};
export type Shift = {
    id: string;
    canvas: string;
    type: string;
    start: number;
    end: number;
    group?: string;
    externalKey?: string;
    locations: {
        name: string;
        required: number;
    }[];
    closed: boolean;
    canceled: boolean;
};
export type Response = {
    id: string;
    worker: string;
    shift: string;
    kind: 'accept' | 'refuse' | 'outside';
    location: string;
    active: boolean;
    absent?: boolean;
    startingReclassified?: number;
};
export type Charge = {
    id: string;
    worker: string;
    shift: string;
    response?: string;
    kind: string;
    hours: number;
    reverses?: string;
    adjustment?: string;
};
export type Adjustment = {
    id: string;
    worker: string;
    shift: string;
    response: string;
    notice: string;
    reason: string;
    replacement: string;
    replacementResponse?: string;
    penalty: boolean;
    applied: boolean;
    canceled: boolean;
};
export type State = {
    workers: Worker[];
    shifts: Shift[];
    responses: Response[];
    charges: Charge[];
    adjustments: Adjustment[];
    canvases: {
        id: string;
        date: string;
        reviewed: boolean;
        baseline: Record<string, number>;
    }[];
    current: string;
    reviewed: boolean;
    history: {
        id: string;
        at: string;
        text: string;
    }[];
    reviews: {
        id: string;
        text: string;
        resolved: boolean;
        responseIds?: string[];
    }[];
};
export const H = 3600000;
const uid = () => crypto.randomUUID();
function assert(ok: unknown, msg: string): asserts ok { if (!ok)
    throw new Error(msg); }
export function parseSeniority(value: string) { const v = value.trim().toUpperCase(); assert(/^(P\d+|\d+P|\d+)$/.test(v), 'Use a seniority number, P100, or 100P.'); return { seniority: Number(v.replace('P', '')), provisional: v.includes('P') }; }
export function dayAdd(date: string, n: number) { return new Date(Date.parse(date + 'T12:00:00Z') + n * 24 * H).toISOString().slice(0, 10); }
export function weekday(date: string) { return new Date(date + 'T12:00:00Z').getUTCDay(); }
const zone = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function localDate(ms: number) { const p = Object.fromEntries(zone.formatToParts(ms).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; }
export function at(date: string, hour: number) { const target = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`); assert(Number.isFinite(target), 'Enter a valid date.'); let t = target; for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(zone.formatToParts(t).map(x => [x.type, x.value]));
    const represented = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    t += target - represented;
} return t; }
export function label(shift: {
    start: number;
    end: number;
}) { const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); return fmt.format(shift.start) + ' – ' + fmt.format(shift.end); }
export function seed(): State { return { workers: Array.from({ length: 46 }, (_, i) => ({ id: `sample-${i + 1}`, name: `Sample Worker ${String(i + 1).padStart(2, '0')}`, starting: Math.floor(i / 6) * 8, seniority: i + 1, provisional: i % 7 === 6, rdo: i < 23 ? 'FS' : 'SM', days: i < 23 ? [0, 1, 2, 3, 6] : [1, 2, 3, 4, 5], overrides: [], active: true })), shifts: [], responses: [], charges: [], adjustments: [], canvases: [], current: '', reviewed: false, history: [], reviews: [] }; }
// FS off Thursday 06:00 through Saturday 22:00: regular starts Sat, Sun, Mon, Tue, Wed.
export function total(s: State, id: string) { return (s.workers.find(w => w.id === id)?.starting || 0) + s.charges.filter(c => c.worker === id).reduce((a, c) => a + c.hours, 0); }
export function compare(s: State, a: Worker, b: Worker) { return total(s, a.id) - total(s, b.id) || Number(a.provisional) - Number(b.provisional) || a.seniority - b.seniority; }
export function currentShifts(s: State) { return s.shifts.filter(e => e.canvas === s.current); }
export function coverage(s: State, e: Shift, location?: string) { const slots = e.locations.filter(l => !location || l.name === location); const required = slots.reduce((a, l) => a + l.required, 0); const assigned = s.responses.filter(r => r.shift === e.id && r.active && r.kind !== 'refuse' && !r.absent && (!location || r.location === location)).length; return { required, assigned, remaining: required - assigned }; }
export function nextShift(s: State) { return currentShifts(s).find(e => !e.canceled && !e.closed && coverage(s, e).remaining > 0); }
export function chipsBlocked(s: State, e: Shift) { const all = currentShifts(s); return e.type === 'Banks' && all.indexOf(e) > all.findIndex(x => x.type === 'Chip-out') && all.some(x => x.type === 'Chip-out' && !x.canceled && coverage(s, x).remaining > 0); }
type Interval = {
    start: number;
    end: number;
    source: string;
};
export function regular(w: Worker, start: number, end: number): Interval[] { const out: Interval[] = []; const first = localDate(start - 3 * 24 * H), last = localDate(end + 3 * 24 * H); for (let d = first; d <= last; d = dayAdd(d, 1)) {
    const override = w.overrides.find(o => o.date === d);
    if (override ? override.work : w.days.includes(weekday(d)))
        out.push({ start: at(d, 22), end: at(dayAdd(d, 1), 6), source: 'regular work' });
} return out; }
export function work(s: State, w: Worker, e: Shift, ignore?: string): Interval[] { return [...regular(w, e.start, e.end), ...s.responses.filter(r => r.worker === w.id && r.id !== ignore && r.active && r.kind === 'accept' && !r.absent).map(r => { const sh = s.shifts.find(x => x.id === r.shift)!; return { start: sh.start, end: sh.end, source: sh.type }; })]; }
export function intervalConflict(intervals: Interval[], candidate: Interval) { if (intervals.some(x => x.start < candidate.end && candidate.start < x.end))
    return 'Overlaps regular work or an accepted assignment.'; const sorted = [...intervals, candidate].sort((a, b) => a.start - b.start); const blocks: Interval[] = []; for (const x of sorted) {
    const last = blocks.at(-1);
    if (last && x.start <= last.end)
        last.end = Math.max(last.end, x.end);
    else
        blocks.push({ ...x });
} for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], next = blocks[i + 1];
    const includesCandidate=b.start<=candidate.start&&b.end>=candidate.end;
    const nextIncludesCandidate=next&&next.start<=candidate.start&&next.end>=candidate.end;
    if (includesCandidate && b.end - b.start > 16 * H)
        return 'Would exceed sixteen consecutive hours of work.';
    if ((includesCandidate||nextIncludesCandidate) && b.end - b.start >= 16 * H && next && next.start - b.end < 8 * H)
        return 'Eight hours off are required after sixteen consecutive hours.';
} return ''; }
export function eligible(s: State, w: Worker, e: Shift, ignore?: string) { if (!w.active)
    return 'Worker is inactive.'; if (e.group && w.rdo !== e.group)
    return 'Different RDO group for this banks offer.'; if (s.responses.some(r => r.worker === w.id && r.shift === e.id && r.active && r.id !== ignore))
    return 'Already answered this shift.'; return intervalConflict(work(s, w, e, ignore), { start: e.start, end: e.end, source: e.type }); }
export function queue(s: State, e: Shift) { return s.workers.filter(w => !eligible(s, w, e)).sort((a, b) => compare(s, a, b)); }
function log(s: State, text: string) { s.history.push({ id: uid(), at: new Date().toISOString(), text }); }
function charge(s: State, worker: string, shift: string, kind: string, hours: number, extra: Partial<Charge> = {}) { s.charges.push({ id: uid(), worker, shift, kind, hours, ...extra }); }
function reverse(s: State, c: Charge) { if (c.reverses || s.charges.some(x => x.reverses === c.id))
    return; charge(s, c.worker, c.shift, 'Reversal', -c.hours, { reverses: c.id, response: c.response, adjustment: c.adjustment }); }
function affected(s: State, text: string) {
    const responseIds=s.responses.filter(r=>r.active&&r.kind!=='outside').map(r=>r.id);
    if(responseIds.length)s.reviews.push({id:uid(),text,resolved:false,responseIds});
}
export function linkedResponses(s: State, response: string) {
    const ids = new Set([response]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const a of s.adjustments.filter(a => !a.canceled)) {
            const replacement = a.replacementResponse || s.charges.find(c => c.adjustment === a.id && c.kind === 'Replacement')?.response;
            if (ids.has(a.response) || (replacement && ids.has(replacement))) {
                for (const id of [a.response, replacement]) if (id && !ids.has(id)) { ids.add(id); changed = true; }
            }
        }
    }
    return ids;
}
export function openingPreview(s: State, e: Shift, response?: string) {
    if (coverage(s, e).required === 1) return cancellationPreview(s, [e.id]);
    const ids = response ? linkedResponses(s, response) : new Set<string>();
    return s.charges.filter(c => c.response && ids.has(c.response) && !c.reverses && !s.charges.some(x => x.reverses === c.id)).map(c => ({worker:s.workers.find(w=>w.id===c.worker)?.name || c.worker,kind:c.kind,hours:-c.hours}));
}
export function incompleteCanvas(s: State) {
    return s.shifts.some(e=>e.canvas!=='prior'&&!e.canceled&&coverage(s,e).remaining>0&&(!e.closed||e.type==='Chip-out'));
}
export function scheduleReviews(s: State) {
    return s.responses.filter(r=>r.active&&r.kind==='accept'&&!r.absent).flatMap(r=>{
        const e=s.shifts.find(e=>e.id===r.shift)!,w=s.workers.find(w=>w.id===r.worker)!;
        const conflict=eligible(s,w,e,r.id);
        return conflict?[{id:r.id,text:`${w.name} · ${e.type} · ${label(e)}: ${conflict}`}]:[];
    });
}
export function cancellationPreview(s: State, ids: string[]) { return s.charges.filter(c => ids.includes(c.shift) && !c.reverses && !s.charges.some(r => r.reverses === c.id)).map(c => ({ worker: s.workers.find(w => w.id === c.worker)?.name || c.worker, kind: c.kind, hours: -c.hours })); }
export function apply(original: State, cmd: any): State {
    const s = structuredClone(original);
    const worker = (id: string) => { const w = s.workers.find(x => x.id === id); assert(w, 'Worker not found.'); return w; };
    const shift = (id: string) => { const e = s.shifts.find(x => x.id === id); assert(e, 'Shift not found.'); return e; };
    const reason = () => { assert(typeof cmd.reason === 'string' && cmd.reason.trim(), 'Enter a reason.'); return cmd.reason.trim(); };
    switch (cmd.type) {
        case 'worker': {
            const n = parseSeniority(cmd.seniority);
            assert(!s.workers.some(w => w.id !== cmd.id && w.seniority === n.seniority), 'Seniority numbers must be unique, including provisional workers.');
            assert(typeof cmd.name === 'string' && cmd.name.trim(), 'Enter a worker name.');
            assert(Number.isFinite(cmd.starting) && cmd.starting >= 0, 'Starting hours must be zero or greater.');
            assert(['FS', 'SM'].includes(cmd.rdo), 'Select an RDO group.');
            assert(Array.isArray(cmd.days) && cmd.days.every((d: any) => Number.isInteger(d) && d >= 0 && d <= 6), 'Invalid regular schedule.');
            assert(Array.isArray(cmd.overrides) && cmd.overrides.every((o: any) => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && typeof o.work === 'boolean'), 'Invalid dated schedule override.');
            const old = cmd.id ? worker(cmd.id) : null;
            const w = { id: old?.id || uid(), name: cmd.name.trim(), starting: old?.starting ?? cmd.starting, ...n, rdo: cmd.rdo, days: [...new Set<number>(cmd.days)], overrides: cmd.overrides, active: cmd.active !== false };
            if (old) {
                assert(cmd.starting === old.starting || !s.charges.some(c => c.worker === old.id), 'Use an hours correction once charges exist.');
                w.starting = cmd.starting;
                s.workers[s.workers.indexOf(old)] = w;
                affected(s, `Review decisions involving ${w.name}: roster or regular schedule changed.`);
            }
            else
                s.workers.push(w);
            s.reviewed = false;
            log(s, `${old ? 'Updated' : 'Added'} worker ${w.name}; seniority ${w.provisional ? 'P' : ''}${w.seniority}; starting ${w.starting} hours; regular nights ${w.days.join(',')}; dated exceptions ${JSON.stringify(w.overrides)}.`);
            break;
        }
        case 'review': {
            assert(!incompleteCanvas(s), 'Finish local canvassing and secure all chip-out coverage before applying next-canvas penalties.');
            for (const a of s.adjustments.filter(a => !a.applied && !a.canceled)) {
                if (a.penalty)
                    charge(s, a.worker, a.shift, 'Absence penalty', 8, { adjustment: a.id, response: a.response });
                a.applied = true;
            }
            s.reviewed = true;
            log(s, 'Reviewed adjustments and applied queued absence penalties once.');
            break;
        }
        case 'setup': {
            assert(s.reviewed, 'Review adjustments first.');
            assert(!incompleteCanvas(s), 'Complete the current canvas and secure chip-out coverage before starting another.');
            assert(!s.adjustments.some(a => !a.applied && !a.canceled), 'Review pending penalties first.');
            assert(weekday(cmd.date) === 5, 'Choose the Friday of the chip-out weekend.');
            assert(!s.canvases.some(c => c.date === cmd.date), 'This weekend already has a canvas. Use its existing records.');
            assert(Array.isArray(cmd.locations) && cmd.locations.length && cmd.locations.every((l: any) => typeof l === 'string' && l.trim()), 'Enter at least one location.');
            assert(new Set(cmd.locations.map((l: string) => l.trim().toLowerCase())).size === cmd.locations.length, 'Location names must be unique.');
            const id = uid();
            s.current = id;
            s.canvases.push({ id, date: cmd.date, reviewed: true, baseline: Object.fromEntries(s.workers.map(w => [w.id, total(s, w.id)])) });
            const add = (type: string, d: string, h: number, group?: string) => { const endDate = h === 22 ? dayAdd(d, 1) : d; const endHour = h === 22 ? 6 : h + 8; s.shifts.push({ id: uid(), canvas: id, type, start: at(d, h), end: at(endDate, endHour), group, locations: type === 'Banks' ? [{ name: 'Banks', required: 18 }] : cmd.locations.map((name: string) => ({ name: name.trim(), required: 2 })), closed: false, canceled: false }); };
            const banks = cmd.banks || [];
            if (banks.includes('thu'))
                add('Banks', dayAdd(cmd.date, -1), 22, 'FS');
            for (let i = 0; i < 7; i++) {
                const d = i === 0 ? cmd.date : dayAdd(cmd.date, i <= 3 ? 1 : 2);
                add('Chip-out', d, [22, 6, 14, 22, 6, 14, 22][i]);
            }
            if (banks.includes('fri'))
                add('Banks', cmd.date, 22, 'FS');
            if (banks.includes('satday'))
                add('Banks', dayAdd(cmd.date, 1), 6);
            if (banks.includes('sat'))
                add('Banks', dayAdd(cmd.date, 1), 22, 'SM');
            if (banks.includes('sunday'))
                add('Banks', dayAdd(cmd.date, 2), 6);
            if (banks.includes('sun'))
                add('Banks', dayAdd(cmd.date, 2), 22, 'SM');
            s.reviewed = false;
            log(s, `Created weekend ${cmd.date}; ${cmd.locations.length} chip-out locations; banks ${banks.join(', ')}.`);
            break;
        }
        case 'respond': {
            const e = nextShift(s);
            assert(e && e.id === cmd.shift, 'This is not the current shift.');
            assert(!chipsBlocked(s, e), 'Secure outside coverage for every chip-out position before remaining banks.');
            const w = queue(s, e)[0];
            assert(w && w.id === cmd.worker, 'The offer order changed. Reload and offer the next worker.');
            assert(['accept', 'refuse'].includes(cmd.kind), 'Invalid response.');
            if (cmd.kind === 'accept') {
                assert(e.locations.some(l => l.name === cmd.location && coverage(s, e, l.name).remaining > 0), 'Choose a location with an open spot.');
            }
            const id = uid();
            s.responses.push({ id, worker: w.id, shift: e.id, kind: cmd.kind, location: cmd.kind === 'accept' ? cmd.location : '', active: true });
            charge(s, w.id, e.id, cmd.kind === 'accept' ? 'Accepted' : 'Refused', 8, { response: id });
            log(s, `${w.name}: ${cmd.kind === 'accept' ? 'accepted ' + cmd.location : 'refused'} ${e.type}, ${label(e)}; +8 hours.`);
            break;
        }
        case 'shortage': {
            const e = nextShift(s);
            assert(e && e.id === cmd.shift, 'Select the current shift.');
            assert(!chipsBlocked(s,e), 'Secure all chip-out coverage before proceeding with remaining banks.');
            assert(queue(s, e).length === 0, 'Continue offers until all eligible local workers have answered.');
            e.closed = true;
            log(s, `Recorded ${coverage(s, e).remaining} unfilled positions: ${e.type}, ${label(e)}.`);
            break;
        }
        case 'reopen': {
            const e=shift(cmd.shift);
            assert(!e.canceled&&e.closed&&coverage(s,e).remaining>0, 'This shift has no recorded shortage to reopen.');
            e.closed=false;
            s.current=e.canvas;
            log(s, `Reopened local offers for ${e.type}, ${label(e)}. Prior responses and assignments were retained.`);
            break;
        }
        case 'outside': {
            const e = shift(cmd.shift);
            assert(!e.canceled, 'This work was canceled.');
            assert(e.locations.some(l => l.name === cmd.location && coverage(s, e, l.name).remaining > 0), 'No open position at this location.');
            assert(e.closed && queue(s, e).length === 0, 'Finish local canvassing and record the shortage first.');
            s.responses.push({ id: uid(), worker: '', shift: e.id, kind: 'outside', location: cmd.location, active: true });
            log(s, `Filled by outside worker: ${e.type}, ${label(e)}, ${cmd.location}. No worker name or hours recorded.`);
            break;
        }
        case 'undo':
        case 'correct': {
            const r = cmd.type === 'undo' ? [...s.responses].reverse().find(r => r.active) : s.responses.find(r => r.id === cmd.response && r.active);
            assert(r, 'No response to reverse.');
            assert(!s.adjustments.some(a => a.response === r.id && !a.canceled), 'Correct the linked absence review first, or cancel the work.');
            assert(!s.adjustments.some(a=>a.replacementResponse===r.id&&!a.canceled), 'Correct the linked absence record to change its replacement entry.');
            r.active = false;
            s.charges.filter(c => c.response === r.id).forEach(c => reverse(s, c));
            if(r.startingReclassified)worker(r.worker).starting+=r.startingReclassified;
            const e = shift(r.shift);
            e.closed = false;
            if(cmd.type==='correct'&&['accept','refuse'].includes(cmd.kind)){
                assert(r.kind!=='outside','Outside coverage has no local-worker response.');
                const w=worker(r.worker);
                assert(!eligible(s,w,e),'The corrected response conflicts with this worker’s actual schedule.');
                if(cmd.kind==='accept')assert(e.locations.some(l=>l.name===cmd.location&&coverage(s,e,l.name).remaining>0),'Select an open location for the corrected acceptance.');
                const replacement:Response={id:uid(),worker:r.worker,shift:e.id,kind:cmd.kind,location:cmd.kind==='accept'?cmd.location:'',active:true};
                s.responses.push(replacement);
                charge(s,r.worker,e.id,cmd.kind==='accept'?'Accepted':'Refused',8,{response:replacement.id});
                log(s,`Recorded corrected ${cmd.kind==='accept'?'acceptance at '+cmd.location:'refusal'} for ${w.name}, ${e.type}, ${label(e)}; +8 hours.`);
            }
            const who=r.kind==='outside'?'Outside coverage':worker(r.worker).name;
            affected(s, `Review subsequent offers after reversing ${who}'s response to ${label(e)}. Existing assignments are preserved.`);
            log(s, `${cmd.type === 'undo' ? 'Undid last response' : 'Corrected response'}: ${who}, ${e.type}, ${label(e)}; reversed linked hours.${cmd.type === 'correct' ? ' Reason: ' + reason() : ''}`);
            break;
        }
        case 'move': {
            const r = s.responses.find(r => r.id === cmd.response && r.active && r.kind === 'accept' && !r.absent);
            assert(r, 'Active assignment not found.');
            const e = shift(r.shift);
            assert(cmd.location !== r.location && e.locations.some(l => l.name === cmd.location && coverage(s, e, l.name).remaining > 0), 'Choose a different open location.');
            const old = r.location;
            r.location = cmd.location;
            log(s, `Corrected ${worker(r.worker).name}'s location from ${old} to ${r.location}, ${label(e)}. ${reason()}`);
            break;
        }
        case 'cancel': {
            assert(Array.isArray(cmd.shifts) && cmd.shifts.length, 'Select overtime events.');
            const why = reason();
            for (const id of new Set<string>(cmd.shifts)) {
                const e = shift(id);
                assert(!e.canceled, 'Work is already canceled.');
                e.canceled = true;
                e.closed = true;
                s.responses.filter(r => r.shift === id).forEach(r => r.active = false);
                s.charges.filter(c => c.shift === id).forEach(c => reverse(s, c));
                s.adjustments.filter(a => a.shift === id).forEach(a => a.canceled = true);
                log(s, `Canceled ${e.type}, ${label(e)}. Reversed all linked charges and penalties. ${why}`);
            }
            affected(s, 'Work was canceled. Review later offers against revised totals; communicated assignments were preserved.');
            break;
        }
        case 'opening': {
            const e = shift(cmd.shift);
            assert(!e.canceled, 'Work is canceled.');
            const l = e.locations.find(l => l.name === cmd.location);
            assert(l && l.required > 0, 'No opening to cancel.');
            const why = reason();
            const r = cmd.response ? s.responses.find(r => r.id === cmd.response && r.shift === e.id && r.location === l.name && r.active && r.kind !== 'refuse') : undefined;
            assert(!cmd.response || r, 'Selected assignment is no longer active.');
            assert(r || !s.responses.some(x=>x.shift===e.id&&x.location===l.name&&x.active&&x.absent), 'Select the called-out assignment to cancel its opening and linked charges.');
            if (r) {
                const ids=linkedResponses(s,r.id);
                s.responses.filter(x=>ids.has(x.id)).forEach(x=>x.active=false);
                s.charges.filter(c => c.response && ids.has(c.response)).forEach(c => reverse(s, c));
                s.adjustments.filter(a => ids.has(a.response)).forEach(a => a.canceled = true);
            }
            else
                assert(coverage(s, e, l.name).remaining > 0, 'Choose the assignment whose opening is being canceled.');
            l.required--;
            assert(coverage(s,e,l.name).remaining>=0, 'Canceling this opening would overfill the remaining work. Choose its covering assignment.');
            if (e.locations.every(x => x.required === 0)) {
                e.canceled = true;
                e.closed = true;
                s.responses.filter(r => r.shift === e.id).forEach(r => r.active = false);
                s.charges.filter(c => c.shift === e.id).forEach(c => reverse(s, c));
                s.adjustments.filter(a => a.shift === e.id).forEach(a => a.canceled = true);
            }
            affected(s, `An opening was canceled for ${label(e)}. Review later offers using updated hours.`);
            log(s, `Canceled one ${l.name} opening, ${label(e)}; ${r?.worker ? worker(r.worker).name : 'unfilled or outside coverage'}. ${why}`);
            break;
        }
        case 'correction': {
            worker(cmd.worker);
            const e = shift(cmd.shift);
            assert(!e.canceled, 'Cannot charge canceled work.');
            assert(Number.isFinite(cmd.hours) && cmd.hours !== 0 && Math.abs(cmd.hours) <= 10000, 'Enter a nonzero hours correction.');
            charge(s, cmd.worker, e.id, 'Correction', cmd.hours);
            s.reviewed = false;
            affected(s, `Review offers after a ${cmd.hours} hour correction for ${worker(cmd.worker).name}.`);
            log(s, `${worker(cmd.worker).name}: ${cmd.hours > 0 ? '+' : ''}${cmd.hours} hours correction linked to ${e.type}, ${label(e)}. ${reason()}`);
            break;
        }
        case 'prior': {
            assert(typeof cmd.key === 'string' && cmd.key.trim(), 'Enter a unique prior assignment reference.');
            assert(!s.shifts.some(e => e.externalKey?.toLowerCase() === cmd.key.trim().toLowerCase()), 'This prior assignment reference is already recorded.');
            worker(cmd.worker);
            const start = at(cmd.date, Number(cmd.hour));
            const e: any = { id: uid(), canvas: 'prior', type: `Prior work: ${cmd.key.trim()}`, externalKey: cmd.key.trim(), start, end: at(Number(cmd.hour) === 22 ? dayAdd(cmd.date, 1) : cmd.date, Number(cmd.hour) === 22 ? 6 : Number(cmd.hour) + 8), locations: [{ name: 'Prior assignment', required: 1 }], closed: true, canceled: false };
            assert([6, 14, 22].includes(Number(cmd.hour)), 'Select a standard eight-hour shift.');
            s.shifts.push(e);
            const r: Response = { id: uid(), worker: cmd.worker, shift: e.id, kind: 'accept', location: 'Prior assignment', active: true };
            s.responses.push(r);
            if (!cmd.alreadyIncluded)
                charge(s, cmd.worker, e.id, 'Accepted', 8, { response: r.id });
            else {
                assert(worker(cmd.worker).starting>=8, 'Starting hours contain fewer than eight hours. Clear the already-included option or correct the starting total.');
                worker(cmd.worker).starting -= 8;
                r.startingReclassified=8;
                charge(s, cmd.worker, e.id, 'Accepted', 8, { response: r.id });
            }
            s.reviewed = false;
            log(s, `Recorded prior assignment ${cmd.key} for ${worker(cmd.worker).name}; original eight ${cmd.alreadyIncluded ? 'reclassified from starting hours' : 'added'}. ${reason()}`);
            break;
        }
        case 'absence': {
            const r = s.responses.find(r => r.id === cmd.response && r.active && r.kind === 'accept');
            assert(r && !r.absent, 'Select an assignment not already marked absent.');
            const e = shift(r.shift);
            assert(!e.canceled, 'Canceled work cannot receive an absence penalty.');
            assert(!s.adjustments.some(a => a.response === r.id && !a.canceled), 'This absence is already recorded.');
            let notice = cmd.notice || '';
            const noticed = notice ? Date.parse(notice) : NaN;
            assert(!notice || Number.isFinite(noticed), 'Enter a valid notice time with UTC offset.');
            const penalty = !notice || e.start - noticed < 4 * H;
            const a: Adjustment = { id: uid(), worker: r.worker, shift: e.id, response: r.id, notice, reason: reason(), replacement: cmd.replacement || '', penalty, applied: false, canceled: false };
            if (a.replacement) {
                const w = worker(a.replacement);
                assert(w.id !== r.worker, 'Replacement must be a different worker.');
                const already = s.responses.find(x => x.worker === w.id && x.shift === e.id && x.active && x.kind === 'accept' && !x.absent);
                if (already) {
                    assert(already.location === r.location, 'Replacement already covers a different opening.');
                    a.replacementResponse=already.id;
                }
                else {
                    assert(!eligible(s, w, e), 'Replacement conflicts with work, rest, or a prior response.');
                    const nr: Response = { id: uid(), worker: w.id, shift: e.id, kind: 'accept', location: r.location, active: true };
                    s.responses.push(nr);
                    a.replacementResponse=nr.id;
                    if(cmd.replacementIncluded){assert(w.starting>=8,'Replacement starting total contains fewer than eight hours.');w.starting-=8;nr.startingReclassified=8;}
                    charge(s, w.id, e.id, 'Replacement', 8, { response: nr.id, adjustment: a.id });
                }
            }
            r.absent = true;
            if(!a.replacement&&e.canvas!=='prior')e.closed=false;
            s.adjustments.push(a);
            s.reviewed = false;
            affected(s, `Review coverage and later offers after ${worker(r.worker).name}'s call-out, ${label(e)}.`);
            log(s, `${worker(r.worker).name} called out: ${label(e)}. Notice: ${notice || 'none'}. Original 8 retained; ${penalty ? '8 penalty queued for next review' : 'no extra penalty'}. ${a.reason}${a.replacement ? ' Replacement: ' + worker(a.replacement).name : ''}`);
            break;
        }
        case 'undoAbsence': {
            const a = s.adjustments.find(a => a.id === cmd.id && !a.canceled);
            assert(a, 'Absence review not found.');
            const r = s.responses.find(r => r.id === a.response)!;
            assert(!shift(a.shift).canceled, 'Work is canceled.');
            const e=shift(a.shift);
            const created=s.charges.filter(c=>c.adjustment===a.id&&c.kind==='Replacement').map(c=>c.response);
            s.responses.filter(x=>created.includes(x.id)&&x.active).forEach(x=>{x.active=false;if(x.startingReclassified)worker(x.worker).starting+=x.startingReclassified;});
            assert(coverage(s,e,r.location).remaining>0, 'This position now has other coverage. Correct that coverage before restoring the original assignment.');
            r.absent = false;
            a.canceled = true;
            s.charges.filter(c => c.adjustment === a.id).forEach(c => reverse(s, c));
            affected(s, 'Absence corrected; review restored assignment and later offers.');
            log(s, `Corrected absence for ${worker(a.worker).name}; linked penalty and replacement entry reversed. ${reason()}`);
            break;
        }
        case 'resolve': {
            const r = s.reviews.find(r => r.id === cmd.id);
            assert(r, 'Review not found.');
            r.resolved = true;
            log(s, `Acknowledged review: ${r.text}`);
            break;
        }
        case 'selectCanvas': {
            assert(s.canvases.some(c => c.id === cmd.id), 'Canvas not found.');
            s.current = cmd.id;
            break;
        }
        default: throw new Error('Unknown action.');
    }
    return s;
}
