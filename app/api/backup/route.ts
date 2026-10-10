import {env} from 'cloudflare:workers';
import {operator} from '@/lib/access';
import {readState, saveState} from '@/lib/state-storage';
import {canImport, stateDigest, validateSnapshot} from '@/lib/migration';
import type {State} from '@/lib/engine';
export const dynamic='force-dynamic';
export async function GET(req:Request) {
    try {
        await operator(req,env.CANVAS_MODE);
        if(!env.DB) throw new Error('Storage unavailable.');
        const snapshot=await readState<State>(env.DB);
        return Response.json({...snapshot,sha256:await stateDigest(snapshot.state)}, {headers:{'Cache-Control':'no-store','Content-Disposition':'attachment; filename="canvas-backup.json"'}});
    } catch {return Response.json({error:'Unable to export. Sign in and retry.'},{status:403});}
}
export async function POST(req:Request) {
    try {
        await operator(req,env.CANVAS_MODE);
        if(env.CANVAS_MODE!=='shared'||!env.DB) throw new Error('Import is available only on the shared site.');
        if(req.headers.get('origin')!==new URL(req.url).origin) throw new Error('Invalid request origin.');
        const body=await req.json() as any;
        const snapshot=validateSnapshot(body.snapshot);
        const current=await readState<State>(env.DB);
        const digest=await stateDigest(snapshot.state);
        if(await stateDigest(current.state)===digest) return Response.json({verified:true,sha256:digest,revision:current.revision});
        if(!canImport(current.state)) throw new Error('This site already contains operational records. Import is locked to prevent overwriting them.');
        if(current.revision!==body.revision) throw new Error('Records changed. Reload before importing.');
        if(!await saveState(env.DB,current.revision,snapshot.state)) throw new Error('Another operator saved first. Import was not applied.');
        const saved=await readState<State>(env.DB);
        if(await stateDigest(saved.state)!==digest) throw new Error('Verification failed. Keep the original backup and contact support.');
        return Response.json({verified:true,sha256:digest,revision:saved.revision,workers:saved.state.workers.length,canvases:saved.state.canvases.length});
    } catch(e) {return Response.json({error:e instanceof Error?e.message:'Import failed.'},{status:400});}
}
