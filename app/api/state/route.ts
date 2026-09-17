import { env } from 'cloudflare:workers';
import { apply, seed, type State } from '@/lib/engine';
export const dynamic = 'force-dynamic';
async function load() { if (!env.DB)
    throw new Error('Storage is unavailable.'); await env.DB.prepare('INSERT OR IGNORE INTO shop_state (id,revision,body) VALUES (1,0,?)').bind(JSON.stringify(seed())).run(); const row = await env.DB.prepare('SELECT revision, body FROM shop_state WHERE id=1').first<{
    revision: number;
    body: string;
}>(); if (!row)
    throw new Error('Storage could not be loaded.'); return { revision: row.revision, state: JSON.parse(row.body) as State }; }
export async function GET() { try {
    return Response.json(await load(), { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    console.error(e);
    return Response.json({ error: 'Saved records could not be loaded. Please retry.' }, { status: 503 });
} }
export async function POST(req: Request) { try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin)
        return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
    const body: any = await req.json();
    const current = await load();
    if (body.revision !== current.revision)
        return Response.json({ error: 'Records changed in another window. Reload before applying this action.' }, { status: 409 });
    const next = apply(current.state, body.command);
    const result = await env.DB!.prepare('UPDATE shop_state SET body=?, revision=revision+1 WHERE id=1 AND revision=?').bind(JSON.stringify(next), current.revision).run();
    if (result.meta.changes !== 1)
        return Response.json({ error: 'Another operator saved first. Reload and review the latest records.' }, { status: 409 });
    return Response.json({ state: next, revision: current.revision + 1 });
}
catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Unable to save. Your previous records are intact.' }, { status: 400 });
} }
