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
  const { removed, rewound } = await transaction(pool, async db => {
    // Versions and audit rows are immutable to the application by design. This
    // is operator reset, so the guards are lifted for this transaction only.
    await db.query('ALTER TABLE artefact_versions DISABLE TRIGGER immutable_versions');
    await db.query('ALTER TABLE audit_events DISABLE TRIGGER immutable_audit');

    await db.query('DELETE FROM audit_events');
    await db.query('DELETE FROM impact_results');
    await db.query('DELETE FROM regulatory_changes');
    const updates = await db.query('DELETE FROM regulatory_updates RETURNING id');

    // Repoint each document at version 1 BEFORE deleting the later versions:
    // the artefact row still references whichever version is current, and the
    // foreign key will refuse the delete otherwise.
    await db.query(`UPDATE artefacts a SET current_version_id = v.id, analysis_version_id = v.id
      FROM artefact_versions v WHERE v.artefact_id = a.id AND v.version = 1`);
    await db.query(`DELETE FROM artefact_segments
      WHERE version_id IN (SELECT id FROM artefact_versions WHERE version > 1)`);
    const versions = await db.query('DELETE FROM artefact_versions WHERE version > 1 RETURNING id');
    await db.query("UPDATE artefact_versions SET status = 'CURRENT' WHERE version = 1");

    await db.query('ALTER TABLE artefact_versions ENABLE TRIGGER immutable_versions');
    await db.query('ALTER TABLE audit_events ENABLE TRIGGER immutable_audit');
    return { removed: updates.rowCount, rewound: versions.rowCount };
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
