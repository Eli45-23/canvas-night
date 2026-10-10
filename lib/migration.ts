import type {State} from './engine.ts';
export function validateSnapshot(value: any): {state: State; revision: number} {
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || !value.state) throw new Error('Invalid backup file.');
    const s=value.state;
    for(const key of ['workers','shifts','responses','charges','canvases','adjustments','history','reviews']) {
        if(!Array.isArray(s[key])) throw new Error(`Backup is missing ${key}.`);
        const ids=s[key].map((v:any)=>v?.id);
        if(ids.some((id:any)=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length) throw new Error(`Invalid or duplicate ${key} records.`);
    }
    if(!s.workers.length||typeof s.current!=='string'||typeof s.reviewed!=='boolean') throw new Error('Backup is incomplete.');
    for(const w of s.workers) if(!Number.isFinite(w.starting)||typeof w.name!=='string') throw new Error('Invalid worker hours.');
    for(const c of s.charges) if(!Number.isFinite(c.hours)||!s.workers.some((w:any)=>w.id===c.worker)) throw new Error('Invalid charge.');
    return value;
}
export function canImport(state: State) {
    return state.canvases.length===0 && state.charges.length===0 && state.responses.length===0 && state.workers.every(w=>/^sample-\d+$/.test(w.id));
}
export async function stateDigest(state: unknown) {
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(state)));
    return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
