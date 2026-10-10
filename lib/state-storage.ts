// Small records avoid D1's 2 MB row limit, including nested roster checkpoints.
const CHUNK_CHARACTERS = 32_000;
export function splitState(state: unknown): string[] {
    const body = JSON.stringify(state);
    const parts: string[] = [];
    for (let i = 0; i < body.length;) {
        let end = Math.min(i + CHUNK_CHARACTERS, body.length);
        if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1])) end--;
        parts.push(body.slice(i, end));
        i = end;
    }
    return parts;
}
export async function initializeStorage(db: D1Database) {
    await db.batch([
        db.prepare('CREATE TABLE IF NOT EXISTS shared_state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, generation TEXT NOT NULL)'),
        db.prepare('CREATE TABLE IF NOT EXISTS shared_state_parts (position INTEGER PRIMARY KEY, body TEXT NOT NULL)'),
        db.prepare("INSERT OR IGNORE INTO shared_state SELECT id, revision, 'legacy' FROM shop_state WHERE id=1"),
    ]);
}
export async function readState<T>(db: D1Database): Promise<{ revision: number; state: T }> {
    // D1 batches execute transactionally, so metadata and parts are one snapshot.
    const [meta, parts, legacy] = await db.batch([
        db.prepare('SELECT revision, generation FROM shared_state WHERE id=1'),
        db.prepare('SELECT body FROM shared_state_parts ORDER BY position'),
        db.prepare("SELECT body FROM shop_state WHERE id=1 AND EXISTS (SELECT 1 FROM shared_state WHERE id=1 AND generation='legacy')"),
    ]);
    const row = meta.results[0] as { revision: number; generation: string } | undefined;
    if (!row) throw new Error('Storage could not be loaded.');
    const body = row.generation === 'legacy' ? (legacy.results[0] as {body: string})?.body : parts.results.map(p => (p as {body: string}).body).join('');
    if (!body) throw new Error('Saved records are incomplete.');
    return { revision: row.revision, state: JSON.parse(body) as T };
}
export async function saveState(db: D1Database, revision: number, state: unknown): Promise<boolean> {
    const generation = crypto.randomUUID();
    const parts = splitState(state);
    // All writes are gated by our unique token. A stale writer cannot delete or
    // insert parts, and a failed batch rolls back the metadata as well as data.
    const results = await db.batch([
        db.prepare('UPDATE shared_state SET revision=revision+1,generation=? WHERE id=1 AND revision=?').bind(generation, revision),
        db.prepare('DELETE FROM shared_state_parts WHERE EXISTS (SELECT 1 FROM shared_state WHERE id=1 AND generation=?)').bind(generation),
        ...parts.map((part, position) => db.prepare('INSERT INTO shared_state_parts (position,body) SELECT ?,? WHERE EXISTS (SELECT 1 FROM shared_state WHERE id=1 AND generation=?)').bind(position, part, generation)),
    ]);
    return results[0].meta.changes === 1;
}
