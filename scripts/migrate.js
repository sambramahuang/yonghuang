import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPool, transaction } from '../backend/src/db.js';
import { hashPassword } from '../backend/src/auth/password.js';

// Versioned, additive migrations. Each runs at most once, inside the same
// advisory-locked transaction, and never drops application tables.
const MIGRATIONS = [
  {
    version: 1,
    async up(db) {
      await db.query(await readFile(new URL('../backend/db/schema.sql', import.meta.url), 'utf8'));
      const { concepts } = JSON.parse(await readFile(new URL('../backend/config/concepts.json', import.meta.url), 'utf8'));
      for (const c of concepts) {
        await db.query('INSERT INTO concepts(id,label,unit,direction,aliases) VALUES ($1,$2,$3,$4,$5)', [c.id,c.label,c.unit,c.direction,c.aliases]);
      }
    },
  },
  {
    version: 2,
    // Adds sign-in. Usernames and password hashes are nullable so existing rows
    // stay valid; the seed below fills them for the two demo accounts.
    async up(db) {
      await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT');
      await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT');
      await db.query('CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users(lower(username))');
      // Demo credentials. These are seeded, well-known, and local-only; the
      // README states them plainly rather than pretending they are secret.
      const seeds = [
        ['REVIEWER', 'rachel', 'reviewer123'],
        ['APPROVER', 'daniel', 'approver123'],
      ];
      for (const [capability, username, password] of seeds) {
        const hash = await hashPassword(password);
        await db.query(
          `UPDATE users SET username=$2, password_hash=$3
           WHERE id=(SELECT id FROM users WHERE capability=$1 AND username IS NULL ORDER BY id LIMIT 1)`,
          [capability, username, hash],
        );
      }
    },
  },
];

export async function migrate(pool) {
  await transaction(pool, async db => {
    await db.query('SELECT pg_advisory_xact_lock(73921501)');
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const applied = new Set((await db.query('SELECT version FROM schema_migrations')).rows.map(r => r.version));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      await migration.up(db);
      await db.query('INSERT INTO schema_migrations(version) VALUES ($1)', [migration.version]);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool();
  try { await migrate(pool); console.log('Database migration complete.'); }
  finally { await pool.end(); }
}
