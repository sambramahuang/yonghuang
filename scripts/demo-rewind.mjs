/**
 * Rewinds the demo to its opening state, without re-ingesting anything.
 *
 *   npm run demo:rewind
 *
 * Clears every finding, regulatory update and audit row, drops any version an
 * approval created, and points each document back at version 1. The documents
 * and their extracted rules are left alone, so this takes seconds rather than
 * the several minutes a full re-ingest costs — run it between takes.
 *
 * Use `npm run demo:reset` instead when the documents themselves have changed
 * and need re-reading.
 */
import { createPool, transaction } from '../backend/src/db.js';

const pool = createPool();

try {
  // Batched into one multi-statement query: each round-trip to Supabase costs
  // ~300ms of network latency, so a dozen separate statements spent seconds
  // waiting on work that is itself instant. The transaction is managed by
  // node-postgres rather than inline BEGIN/COMMIT, which a simple query does
  // not honour.
  const { removed, rewound } = await transaction(pool, async db => {
    const counts = (await db.query(`SELECT
      (SELECT count(*) FROM regulatory_updates)::int AS removed,
      (SELECT count(*) FROM artefact_versions WHERE version > 1)::int AS rewound`)).rows[0];

    await db.query(`
      ALTER TABLE artefact_versions DISABLE TRIGGER immutable_versions;
      ALTER TABLE audit_events DISABLE TRIGGER immutable_audit;
      DELETE FROM audit_events;
      DELETE FROM impact_results;
      DELETE FROM regulatory_changes;
      DELETE FROM regulatory_updates;
      -- Repoint each document at version 1 BEFORE deleting later versions: the
      -- artefact row still references whichever version is current, and the
      -- foreign key refuses the delete otherwise.
      UPDATE artefacts a SET current_version_id = v.id, analysis_version_id = v.id
        FROM artefact_versions v WHERE v.artefact_id = a.id AND v.version = 1;
      DELETE FROM artefact_segments
        WHERE version_id IN (SELECT id FROM artefact_versions WHERE version > 1);
      DELETE FROM artefact_versions WHERE version > 1;
      UPDATE artefact_versions SET status = 'CURRENT' WHERE version = 1;
      ALTER TABLE artefact_versions ENABLE TRIGGER immutable_versions;
      ALTER TABLE audit_events ENABLE TRIGGER immutable_audit;
    `);
    return counts;
  });

  const { rows } = await pool.query(`SELECT a.name,
      count(r.id) FILTER (WHERE r.concept IS NOT NULL)::int AS rules
    FROM artefacts a
    LEFT JOIN artefact_versions v ON v.id = a.analysis_version_id
    LEFT JOIN artefact_segments s ON s.version_id = v.id
    LEFT JOIN internal_rules r ON r.segment_id = s.id
    GROUP BY a.id, a.name ORDER BY a.id`);

  console.log(`Rewound: ${removed} regulatory update(s) removed, ${rewound} approved version(s) rolled back.\n`);
  console.log(`${rows.length} document(s), no findings:`);
  for (const row of rows) {
    // A document with no extracted rule can only ever match lexically, so it
    // is worth naming here rather than discovering it mid-demo.
    console.log(`  ${row.name}${row.rules === 0 ? '   (no rules extracted — will not flag)' : ''}`);
  }
  console.log('\nUpload an amendment from data/amendments/ to begin.');
} finally {
  await pool.end();
}
