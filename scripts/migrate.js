import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPool, transaction } from '../backend/src/db.js';

export async function migrate(pool) {
  await transaction(pool, async db => {
    await db.query("SELECT pg_advisory_xact_lock(73921501)");
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    if ((await db.query('SELECT 1 FROM schema_migrations WHERE version=1')).rowCount) return;
    await db.query(await readFile(new URL('../backend/db/schema.sql', import.meta.url), 'utf8'));
    const { concepts } = JSON.parse(await readFile(new URL('../backend/config/concepts.json', import.meta.url), 'utf8'));
    for (const c of concepts) {
      await db.query('INSERT INTO concepts(id,label,unit,direction,aliases) VALUES ($1,$2,$3,$4,$5)', [c.id,c.label,c.unit,c.direction,c.aliases]);
    }
    await db.query('INSERT INTO schema_migrations(version) VALUES (1)');
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool();
  try { await migrate(pool); console.log('Database migration complete.'); }
  finally { await pool.end(); }
}
