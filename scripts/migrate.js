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
  {
    version: 3,
    // Widen the format check so PDF uploads are storable.
    async up(db) {
      await db.query('ALTER TABLE artefacts DROP CONSTRAINT IF EXISTS artefacts_format_check');
      await db.query("ALTER TABLE artefacts ADD CONSTRAINT artefacts_format_check CHECK (format IN ('DOCX','PDF','JSON'))");
    },
  },
  {
    version: 4,
    // Allow model-drafted TEXT patches on findings that fail the deterministic
    // boundary. VALUE patches keep their original, stricter guarantee: they may
    // only exist on a structured UPDATE_NEEDED finding.
    async up(db) {
      await db.query('ALTER TABLE impact_results DROP CONSTRAINT IF EXISTS only_updates_patched');
      await db.query(`ALTER TABLE impact_results ADD CONSTRAINT only_updates_patched CHECK (
        proposed_patch IS NULL
        OR (proposed_patch->>'kind' = 'VALUE' AND evidence_tier='STRUCTURED' AND system_status='UPDATE_NEEDED')
        OR (proposed_patch->>'kind' = 'TEXT' AND system_status IN ('UPDATE_NEEDED','LEGAL_REVIEW_REQUIRED'))
      )`);
      // A TEXT patch must never claim to be verified. Dropped first: schema.sql
      // already defines it for databases created at version 1.
      await db.query('ALTER TABLE impact_results DROP CONSTRAINT IF EXISTS text_patch_unverified');
      await db.query(`ALTER TABLE impact_results ADD CONSTRAINT text_patch_unverified CHECK (
        proposed_patch IS NULL OR proposed_patch->>'kind' <> 'TEXT'
        OR (proposed_patch->>'verified')::boolean IS FALSE
      )`);
    },
  },
  {
    version: 5,
    // Duties carry comparators too: "must submit within 30 days" is
    // modality MUST with operator <=. Only MAY asserts no threshold.
    async up(db) {
      const name = (await db.query(`SELECT conname FROM pg_constraint
        WHERE conrelid='internal_rules'::regclass AND contype='c'
          AND pg_get_constraintdef(oid) LIKE '%modality%operator%'`)).rows[0]?.conname;
      if (name) await db.query(`ALTER TABLE internal_rules DROP CONSTRAINT "${name}"`);
      await db.query(`ALTER TABLE internal_rules ADD CONSTRAINT internal_rules_modality_operator CHECK (
        (modality = 'IS' AND operator IS NOT NULL) OR (modality = 'MAY' AND operator IS NULL)
        OR modality IN ('MUST','MUST_NOT'))`);
    },
  },
  {
    version: 6,
    // A senior partner may review and approve their own wording: the authority
    // to sign off sits with them, and only an APPROVER can approve at all.
    // The audit trail still records each action against its actor.
    async up(db) {
      await db.query('ALTER TABLE impact_results DROP CONSTRAINT IF EXISTS approver_is_not_proposer');
      const { rows } = await db.query(`SELECT conname FROM pg_constraint
        WHERE conrelid='impact_results'::regclass AND contype='c'
          AND pg_get_constraintdef(oid) LIKE '%approved_by%DISTINCT FROM%submitted_by%'`);
      for (const row of rows) await db.query(`ALTER TABLE impact_results DROP CONSTRAINT "${row.conname}"`);
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
