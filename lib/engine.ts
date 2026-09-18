// Pure scheduling and accounting engine, shared by the UI and authoritative API.
export type Worker = {
    id: string;
    name: string;
    starting: number;
    seniority: number;
    provisional: boolean;
    seniorityMissing?: boolean;
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
    replacementCalls?: {id:string;adjustment:string;worker:string;kind:'accept'|'decline';response?:string}[];
    sampleArchive?: { at: string; source: string; state: State };
    baselineResetArchive?: { at: string; source: string; state: State };
    notHere?: {id:string;worker:string;canvas:string;shift:string;active:boolean;responseCount:number}[];
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
        canvassedOn?: string;
        roster?: Worker[];
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
export const BASELINE_RESET_SOURCE = 'Shop overtime starting-hour sheets for September 18–21, 2026';
export const SEPT_18_ROSTER = [
    {seniority:'11P',name:'A. Polyakov',hours:544,rdo:'FS'}, {seniority:'18P',name:'G. Campbell',hours:561,rdo:'FS'}, {seniority:'41P',name:'L. C. Bibby',hours:489,rdo:'FS'},
    {seniority:'54P',name:'R. Simon',hours:618,rdo:'FS'}, {seniority:'56P',name:'C. Perez',hours:568,rdo:'FS'}, {seniority:'70P',name:'P. Sohan',hours:617,rdo:'FS'},
    {seniority:'96P',name:'J. Valle',hours:610,rdo:'FS'}, {seniority:'97P',name:'S. Matthews',hours:536,rdo:'FS'}, {seniority:'99P',name:'J. Holley',hours:626,rdo:'FS'},
    {seniority:'125P',name:'L. Santos',hours:518,rdo:'FS'}, {seniority:'146P',name:'B. Shivpaul CDL',hours:592,rdo:'FS'}, {seniority:'147P',name:'S. Lewis',hours:608,rdo:'FS'},
    {seniority:'164P',name:'D. Gabriel',hours:550,rdo:'FS'}, {seniority:'169P',name:'G. Mendonca',hours:598,rdo:'FS'}, {seniority:'173P',name:'L. Gittens',hours:602,rdo:'FS'},
    {seniority:'192P',name:'J. Hamilton CDL',hours:622,rdo:'FS'}, {seniority:'193P',name:'E. Maloski CDL',hours:608,rdo:'FS'}, {seniority:'197P',name:'A. Urbina',hours:624,rdo:'FS'},
    {seniority:'202P',name:'J. Davilla',hours:609,rdo:'FS'}, {seniority:'203P',name:'J. Burke',hours:617,rdo:'FS'}, {seniority:'204P',name:'K. Felix',hours:625,rdo:'FS'},
    {seniority:'63',name:'T. Codrington',hours:632,rdo:'SM'}, {seniority:'115',name:'B. Santana',hours:590,rdo:'SM'}, {seniority:'119',name:'M. Mohan',hours:638,rdo:'SM'},
    {seniority:'133',name:'R. Metoo',hours:651,rdo:'SM'}, {seniority:'168',name:'V. Campbell',hours:644,rdo:'SM'}, {seniority:'169',name:'N. Cottone',hours:608,rdo:'SM'},
    {seniority:'182',name:'D. Champagnie',hours:586,rdo:'SM'}, {seniority:'186',name:'E. Colon',hours:616,rdo:'SM'}, {seniority:'188',name:'B. Mistry',hours:582,rdo:'SM'},
    {seniority:'189',name:'E. Lawes',hours:642,rdo:'SM'}, {seniority:'196',name:'D. Ahel',hours:632,rdo:'SM'}, {seniority:'230',name:'B. Green',hours:650,rdo:'SM'},
    {seniority:'233',name:'W. Gordon',hours:602,rdo:'SM'}, {seniority:'248',name:'J. Quin',hours:610,rdo:'SM'}, {seniority:'268',name:'J. Prince',hours:657,rdo:'SM'},
    {seniority:'42P',name:'C. Allen CDL',hours:656,rdo:'SM'}, {seniority:'50P',name:'A. Stadnyk CDL',hours:620,rdo:'SM'}, {seniority:'113P',name:'T. Vidal',hours:599,rdo:'SM'},
    {seniority:'134P',name:'P. Wessels CDL',hours:599,rdo:'SM'}, {seniority:'180P',name:'D. Martinez',hours:606,rdo:'SM'}, {seniority:'300P',name:'A. Raffee',hours:640,rdo:'SM'},
] as const;
export const SEPT_18_BASELINE = SEPT_18_ROSTER.map(({name,hours,rdo})=>({name,hours,rdo}));
const uid = () => crypto.randomUUID();
function assert(ok: unknown, msg: string): asserts ok { if (!ok)
    throw new Error(msg); }
export function parseSeniority(value: string) { const v = value.trim().toUpperCase(); if(v==='-'||v==='—') return {seniority:0,provisional:false,seniorityMissing:true as const}; assert(/^(P\d+|\d+P|\d+)$/.test(v), 'Use a seniority number, P100, 100P, or — if not provided.'); return { seniority: Number(v.replace('P', '')), provisional: v.includes('P') }; }
export function seniorityLabel(w: Pick<Worker,'seniority'|'provisional'|'seniorityMissing'>) { return w.seniorityMissing?'—':`${w.seniority}${w.provisional?'P':''}`; }
export function employmentStatus(w: Pick<Worker,'provisional'|'seniorityMissing'>) { return w.seniorityMissing?'Status not listed':w.provisional?'Provisional':'Permanent'; }
export function compareSeniority(a: Pick<Worker,'seniority'|'provisional'|'seniorityMissing'>, b: Pick<Worker,'seniority'|'provisional'|'seniorityMissing'>) { if(!!a.seniorityMissing!==!!b.seniorityMissing)return Number(!!a.seniorityMissing)-Number(!!b.seniorityMissing); if(a.seniorityMissing&&b.seniorityMissing)return 0; return Number(a.provisional)-Number(b.provisional)||a.seniority-b.seniority; }
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
const baselineName = (name: string) => name.trim().toLowerCase();
export function baselineResetPreview(s: State) {
    const errors: string[] = [];
    if (s.baselineResetArchive) errors.push('The Sept. 18 baseline reset was already applied.');
    if (s.workers.length !== SEPT_18_BASELINE.length) errors.push(`Current roster has ${s.workers.length} workers; expected ${SEPT_18_BASELINE.length}.`);
    const byName = new Map<string, Worker[]>();
    for (const w of s.workers) {
        const key=baselineName(w.name),list=byName.get(key)||[];list.push(w);byName.set(key,list);
    }
    const targetNames=new Set(SEPT_18_BASELINE.map(t=>baselineName(t.name)));
    const extras=s.workers.filter(w=>!targetNames.has(baselineName(w.name)));
    if(extras.length) errors.push(`Workers not in the Sept. 18 baseline: ${extras.map(w=>w.name).join(', ')}.`);
    const rows=SEPT_18_BASELINE.flatMap(target=>{
        const matches=byName.get(baselineName(target.name))||[];
        if(matches.length!==1){
            errors.push(matches.length===0?`Missing baseline worker: ${target.name}.`:`Duplicate roster name for baseline worker: ${target.name}.`);
            return [];
        }
        const w=matches[0];
        if(w.rdo!==target.rdo) errors.push(`${target.name} is in RDO group ${w.rdo}; baseline expects ${target.rdo}.`);
        return [{worker:w,current:total(s,w.id),target:target.hours,difference:target.hours-total(s,w.id)}];
    });
    return {rows,errors};
}
export function compare(s: State, a: Worker, b: Worker) { return total(s, a.id) - total(s, b.id) || compareSeniority(a,b); }
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
export function eligible(s: State, w: Worker, e: Shift, ignore?: string) { if (!ignore && (s.notHere || []).some(n=>n.active&&n.worker===w.id&&n.canvas===e.canvas))
    return 'Not here — skipped for this entire canvas; no hours charged.'; if (!w.active)
    return 'Worker is inactive.'; if (e.group && w.rdo !== e.group)
    return 'Different RDO group for this banks offer.'; if (s.responses.some(r => r.worker === w.id && r.shift === e.id && r.active && r.id !== ignore && !(ignore && r.kind==='refuse' && s.charges.some(c=>c.response===ignore&&c.kind==='Replacement'))))
    return 'Already answered this shift.'; return intervalConflict(work(s, w, e, ignore), { start: e.start, end: e.end, source: e.type }); }
export function queue(s: State, e: Shift) { return s.workers.filter(w => !eligible(s, w, e)).sort((a, b) => compare(s, a, b)); }
export function replacementQueue(s: State, a: Adjustment) {
    const e=s.shifts.find(e=>e.id===a.shift), original=s.responses.find(r=>r.id===a.response);
    if(!e || !original || a.canceled || e.canceled || a.replacement || coverage(s,e,original.location).remaining<=0) return [];
    return s.workers.filter(w=>w.active && (!e.group || w.rdo===e.group)
        && !s.responses.some(r=>r.worker===w.id && r.shift===e.id && r.active && r.kind==='accept')
        && !(s.replacementCalls||[]).some(c=>c.adjustment===a.id&&c.worker===w.id)
        && !intervalConflict(work(s,w,e),{start:e.start,end:e.end,source:e.type}))
        .sort((a,b)=>compare(s,a,b));
}
export function lateAvailableQueue(s: State, e: Shift) {
    if(e.canceled || coverage(s,e).remaining<=0) return [];
    const marked=new Set((s.notHere||[]).filter(n=>n.active&&n.canvas===e.canvas).map(n=>n.worker));
    return s.workers.filter(w=>marked.has(w.id)&&w.active&&(!e.group||w.rdo===e.group)
        && !s.responses.some(r=>r.worker===w.id&&r.shift===e.id&&r.active)
        && !intervalConflict(work(s,w,e),{start:e.start,end:e.end,source:e.type}))
        .sort((a,b)=>compare(s,a,b));
}
export function canvasSheet(s: State, id: string) {
    const canvas=s.canvases.find(c=>c.id===id);
    assert(canvas,'Select a saved canvas.');
    const shifts=s.shifts.filter(e=>e.canvas===id);
    const roster=canvas.roster ? [...canvas.roster] : s.workers.filter(w=>w.id in canvas.baseline);
    for(const w of s.workers)if(!roster.some(r=>r.id===w.id)&&s.charges.some(c=>c.worker===w.id&&shifts.some(e=>e.id===c.shift)))roster.push(w);
    const rows=roster.map(w=>{
        const opening=canvas.baseline[w.id] ?? w.starting;
        let running=opening;
        const cells=shifts.map(e=>{
            const entries=s.charges.filter(c=>c.worker===w.id&&c.shift===e.id);
            const hours=entries.reduce((n,c)=>n+c.hours,0);running+=hours;
            return {shift:e.id,hours,running,entries};
        });
        return {worker:w,opening,cells,ending:running};
    });
    return {canvas,shifts,rows,start:shifts.length?localDate(Math.min(...shifts.map(e=>e.start))):canvas.date,end:shifts.length?localDate(Math.max(...shifts.map(e=>e.end))):canvas.date};
}
export function sheetShiftsForGroup(s: State, id: string, group: string) {
    const report=canvasSheet(s,id),rows=report.rows.filter(r=>r.worker.rdo===group);
    return report.shifts.filter(e=>rows.some(r=>r.cells.some(c=>c.shift===e.id&&c.entries.length>0)) ||
        ((!e.group||e.group===group)&&rows.some(r=>!intervalConflict(regular(r.worker,e.start,e.end),{start:e.start,end:e.end,source:e.type}))));
}
export function sheetShiftSectionsForGroup(s: State, id: string, group: string, perSection=4) {
    assert(Number.isInteger(perSection)&&perSection>0&&perSection<=8,'Use 1–8 shifts per sheet section.');
    const visible=sheetShiftsForGroup(s,id,group),sections:Shift[][]=[];
    for(let i=0;i<visible.length;i+=perSection) sections.push(visible.slice(i,i+perSection));
    return sections;
}
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
        case 'loadSept18Roster': {
            assert(s.workers.length > 0 && s.workers.every(w => /^sample-\d+$/.test(w.id) && /^Sample Worker \d+$/.test(w.name)), 'The Sept. 18 shop roster can only replace the untouched sample roster.');
            assert(!s.sampleArchive, 'The sample roster has already been replaced.');
            const archived=structuredClone(s);
            const next:State={...seed(),workers:[]};
            next.workers=SEPT_18_ROSTER.map(entry=>{
                const parsed=parseSeniority(entry.seniority);
                return {id:uid(),name:entry.name,starting:entry.hours,...parsed,rdo:entry.rdo,days:entry.rdo==='FS'?[0,1,2,3,6]:[1,2,3,4,5],overrides:[],active:true};
            });
            next.sampleArchive={at:new Date().toISOString(),source:BASELINE_RESET_SOURCE,state:archived};
            log(next,`Replaced ${s.workers.length} sample workers with the 42-worker Sept. 18 shop roster and paper-sheet starting hours. Sample activity was archived; A. Raffee is 300P.`);
            return next;
        }
        case 'resetRosterBaseline': {
            assert(!s.baselineResetArchive, 'The Sept. 18 baseline reset was already applied.');
            const preview=baselineResetPreview(s);
            assert(preview.errors.length===0, preview.errors.join(' '));
            const archived=structuredClone(s);
            for(const row of preview.rows) worker(row.worker.id).starting=row.target;
            s.baselineResetArchive={at:new Date().toISOString(),source:BASELINE_RESET_SOURCE,state:archived};
            s.shifts=[];s.responses=[];s.charges=[];s.adjustments=[];s.canvases=[];s.current='';
            s.reviews=[];s.notHere=[];s.replacementCalls=[];s.reviewed=false;s.history=[];
            log(s,`Archived the previous operational state and applied the Sept. 18 baseline to ${preview.rows.length} workers. Roster identity and schedules were preserved.`);
            break;
        }
        case 'canvasDate': {
            const c=s.canvases.find(c=>c.id===cmd.canvas);assert(c,'Select a saved canvas.');
            assert(/^\d{4}-\d{2}-\d{2}$/.test(cmd.date)&&localDate(at(cmd.date,12))===cmd.date,'Enter a valid canvassing date.');
            c.canvassedOn=cmd.date;log(s,`Set canvassing date for weekend ${c.date} to ${cmd.date}.`);break;
        }
        case 'extraShift': {
            const c=s.canvases.find(c=>c.id===cmd.canvas);assert(c,'Select the canvas this work belongs to.');
            assert(['Banks','Material pickup'].includes(cmd.workType),'Choose banks or material pickup.');
            assert(/^\d{4}-\d{2}-\d{2}$/.test(cmd.date)&&localDate(at(cmd.date,12))===cmd.date,'Enter a valid work date.');
            assert([6,14,22].includes(cmd.hour),'Choose a shift start time.');
            assert(Number.isInteger(cmd.required)&&cmd.required>0&&cmd.required<=100,'Enter 1–100 positions.');
            assert(typeof cmd.location==='string'&&cmd.location.trim(),'Enter a location.');
            assert(!s.shifts.some(e=>e.canvas===c.id&&!e.canceled&&e.type===cmd.workType&&e.start===at(cmd.date,cmd.hour)&&e.locations.some(l=>l.name===cmd.location.trim())),'This work is already listed.');
            const e:Shift={id:uid(),canvas:c.id,type:cmd.workType,start:at(cmd.date,cmd.hour),end:at(cmd.hour===22?dayAdd(cmd.date,1):cmd.date,cmd.hour===22?6:cmd.hour+8),locations:[{name:cmd.location.trim(),required:cmd.required}],closed:false,canceled:false};
            if(cmd.workType==='Banks'&&cmd.hour===22){const d=weekday(cmd.date);if(d===4||d===5)e.group='FS';if(d===6||d===0)e.group='SM';}
            s.shifts.push(e);s.current=c.id;
            log(s,`Added ${e.type}, ${label(e)}, ${cmd.required} positions at ${cmd.location.trim()} to weekend ${c.date}.`);break;
        }
        case 'lateAvailabilityAssign': {
            const e=shift(cmd.shift);
            assert(!e.canceled,'This work was canceled.');
            assert(coverage(s,e).remaining>0,'This shift no longer has open coverage.');
            assert(typeof cmd.location==='string'&&e.locations.some(l=>l.name===cmd.location),'Choose a valid location.');
            assert(coverage(s,e,cmd.location).remaining>0,'This location no longer has an open position.');
            const w=lateAvailableQueue(s,e).find(w=>w.id===cmd.worker);
            assert(w,'This worker is no longer eligible for late availability.');
            const id=uid();
            s.responses.push({id,worker:w.id,shift:e.id,kind:'accept',location:cmd.location,active:true});
            charge(s,w.id,e.id,'Accepted',8,{response:id});
            log(s,`${w.name}: late availability accepted ${e.type}, ${label(e)}, ${cmd.location}; +8 hours. Original Not here record retained.`);
            break;
        }
        case 'replacementOutside': {
            const a=s.adjustments.find(a=>a.id===cmd.adjustment&&!a.canceled);
            assert(a&&!a.replacement,'Select an unfilled call-out.');
            const e=shift(a.shift),original=s.responses.find(r=>r.id===a.response)!;
            assert(!e.canceled&&coverage(s,e,original.location).remaining>0,'This opening is no longer available.');
            assert(replacementQueue(s,a).length===0,'Contact all eligible local replacements first.');
            const r:Response={id:uid(),worker:'',shift:e.id,kind:'outside',location:original.location,active:true};
            s.responses.push(r);a.replacement='outside';a.replacementResponse=r.id;
            log(s,`Last-minute replacement filled by outside worker: ${e.type}, ${label(e)}, ${original.location}. No name or hours recorded.`);
            break;
        }
        case 'replacementRespond': {
            const a=s.adjustments.find(a=>a.id===cmd.adjustment&&!a.canceled);
            assert(a&&!a.replacement,'Select an unfilled call-out.');
            const e=shift(a.shift),original=s.responses.find(r=>r.id===a.response)!;
            assert(!e.canceled&&original.absent&&coverage(s,e,original.location).remaining>0,'This opening is no longer available.');
            const w=replacementQueue(s,a)[0];
            assert(w&&w.id===cmd.worker,'The replacement order changed. Reload and contact the next worker.');
            assert(['accept','decline'].includes(cmd.kind),'Invalid replacement answer.');
            const call:{id:string;adjustment:string;worker:string;kind:'accept'|'decline';response?:string}={id:uid(),adjustment:a.id,worker:w.id,kind:cmd.kind};
            if(cmd.kind==='accept'){
                const r:Response={id:uid(),worker:w.id,shift:e.id,kind:'accept',location:original.location,active:true};
                s.responses.push(r);a.replacement=w.id;a.replacementResponse=r.id;call.response=r.id;
                charge(s,w.id,e.id,'Replacement',8,{response:r.id,adjustment:a.id});
            }
            (s.replacementCalls ||= []).push(call);
            log(s,`${w.name}: last-minute replacement ${cmd.kind==='accept'?'accepted; +8 hours':'declined; no hours charged'}, ${e.type}, ${label(e)}, ${original.location}.`);
            break;
        }
        case 'replaceSamples': {
            assert(s.workers.length > 0 && s.workers.every(w => /^sample-\d+$/.test(w.id) && /^Sample Worker \d+$/.test(w.name)), 'Only an entirely sample roster can be replaced.');
            assert(!s.sampleArchive, 'Sample roster has already been replaced.');
            assert(Array.isArray(cmd.workers) && cmd.workers.length > 0, 'Provide the replacement roster.');
            assert(typeof cmd.source === 'string' && cmd.source.trim(), 'Provide the roster source.');
            let next: State = { ...seed(), workers: [] };
            for (const w of cmd.workers) next = apply(next, { ...w, id: undefined, type: 'worker' });
            next.sampleArchive = { at: new Date().toISOString(), source: cmd.source, state: s };
            log(next, `Replaced ${s.workers.length} sample workers with ${next.workers.length} workers from ${cmd.source}. Sample canvases and charges archived separately; imported hours are the new opening balances.`);
            return next;
        }
        case 'notHere': {
            const e=nextShift(s);
            assert(e&&e.id===cmd.shift,'This is not the current shift.');
            assert(!chipsBlocked(s,e),'Secure chip-out coverage before remaining banks.');
            const w=queue(s,e)[0];
            assert(w&&w.id===cmd.worker,'The next worker changed. Reload before recording Not here.');
            (s.notHere ||= []).push({id:uid(),worker:w.id,canvas:e.canvas,shift:e.id,active:true,responseCount:s.responses.length});
            log(s,`${w.name}: Not here. Skipped for the entire canvas starting ${label(e)}. No hours added or subtracted; earlier assignments remain recorded.`);
            break;
        }
        case 'restoreHere': {
            const n=(s.notHere||[]).find(n=>n.id===cmd.id&&n.active&&n.canvas===s.current);
            assert(n,'Active Not here entry not found for this canvas.');
            n.active=false;
            const e=shift(n.shift);if(!e.canceled)e.closed=false;
            affected(s,`Review subsequent offers after restoring ${worker(n.worker).name} to this canvas. Existing assignments are preserved.`);
            log(s,`Undid Not here for ${worker(n.worker).name}; eligible offers resume in hours-and-seniority order. No hours changed.`);
            break;
        }
        case 'worker': {
            const n = parseSeniority(cmd.seniority);
            assert(n.seniorityMissing || !s.workers.some(w => w.id !== cmd.id && !w.seniorityMissing && w.seniority === n.seniority && w.provisional === n.provisional), 'Seniority numbers must be unique within permanent or provisional status.');
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
            const canvassedOn=cmd.canvassedOn || localDate(Date.now());
            assert(/^\d{4}-\d{2}-\d{2}$/.test(canvassedOn)&&localDate(at(canvassedOn,12))===canvassedOn,'Enter a valid canvassing date.');
            s.canvases.push({ id, date: cmd.date, canvassedOn, roster:structuredClone(s.workers), reviewed: true, baseline: Object.fromEntries(s.workers.map(w => [w.id, total(s, w.id)])) });
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
            if(cmd.type==='undo'){
                const n=[...(s.notHere||[])].reverse().find(n=>n.active&&n.canvas===s.current);
                const lastResponse=s.responses.findLastIndex(r=>r.active);
                if(n&&lastResponse<n.responseCount)return apply(s,{type:'restoreHere',id:n.id});
            }
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
            if(!a.replacement&&e.canvas!=='prior'&&coverage(s,e).remaining===1)e.closed=true;
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
            const created=[...(a.replacement==='outside'?[a.replacementResponse]:[]),...s.charges.filter(c=>c.adjustment===a.id&&c.kind==='Replacement').map(c=>c.response)];
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
