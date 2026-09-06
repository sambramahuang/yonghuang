// Puts the database in the state the demo starts from: the "old" firm
// documents ingested and extracted, and no regulatory update yet analysed.
//
//   node scripts/demo-reset.mjs            # notice-period scenario (default)
//   node scripts/demo-reset.mjs --keep     # keep existing artefacts, clear findings only
//
// Run the demo from there: upload an amendment, analyse, and several documents
// light up at once.
import { readFile } from 'node:fs/promises';
import { createPool, transaction } from '../backend/src/db.js';
import { ingest } from '../backend/src/ingest/index.js';
import { fixtureExtractor, liveExtractor, fixtureDiscoverer, liveDiscoverer } from '../backend/src/extract/providers.js';

const KEEP = process.argv.includes('--keep');
// The two domains the demo covers. Each amendment is uploaded live on stage,
// so only the firm's own documents are seeded here.
const OLD_DOCUMENTS = [
  ['EXECUTIVE EMPLOYMENT AGREEMENT.docx', 'template'],
  ['JUNIOR STAFF EMPLOYMENT AGREEMENT.docx', 'template'],
  ['INTERNAL PRACTICE PLAYBOOK.docx', 'playbook'],
  ['Cloud IT Outsourcing Agreement.docx', 'template'],
  ['Cybersecurity Compliance Manual.docx', 'handbook'],
  ['Cloud IT Vendor Due Diligence Checklist.docx', 'checklist'],
];
const DIR = new URL('../data/firm-documents/', import.meta.url);

/** Removes an artefact and everything hanging off it, for a re-ingest. */
async function discard(pool, id) {
  await transaction(pool, async db => {
    await db.query('ALTER TABLE artefact_versions DISABLE TRIGGER immutable_versions');
    for (const q of [
      'DELETE FROM internal_rules WHERE segment_id IN (SELECT s.id FROM artefact_segments s JOIN artefact_versions v ON v.id=s.version_id WHERE v.artefact_id=$1)',
      'DELETE FROM artefact_segments WHERE version_id IN (SELECT id FROM artefact_versions WHERE artefact_id=$1)',
      'UPDATE artefacts SET current_version_id=NULL, analysis_version_id=NULL WHERE id=$1',
      'DELETE FROM artefact_versions WHERE artefact_id=$1',
      'DELETE FROM artefacts WHERE id=$1',
    ]) await db.query(q, [id]);
    await db.query('ALTER TABLE artefact_versions ENABLE TRIGGER immutable_versions');
  });
}

const pool = createPool();
const mode = process.env.EXTRACTION_MODE ?? 'fixture';
const extractor = mode === 'live'
  ? liveExtractor({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL })
  : fixtureExtractor();
const discoverer = mode === 'live'
  ? liveDiscoverer({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL })
  : fixtureDiscoverer();

try {
  await transaction(pool, async db => {
    // Versions and audit rows are immutable to the application by design; this
    // is operator reset, so the guards are lifted for this transaction only.
    await db.query('ALTER TABLE artefact_versions DISABLE TRIGGER immutable_versions');
    await db.query('ALTER TABLE audit_events DISABLE TRIGGER immutable_audit');
    await db.query('DELETE FROM audit_events');
    await db.query('DELETE FROM impact_results');
    if (!KEEP) {
      await db.query('DELETE FROM internal_rules');
      await db.query('DELETE FROM artefact_segments');
      await db.query('UPDATE artefacts SET current_version_id=NULL, analysis_version_id=NULL');
      await db.query('DELETE FROM artefact_versions');
      await db.query('DELETE FROM artefacts');
    }
    // Updates are re-uploaded during the demo, so they go too.
    await db.query('DELETE FROM regulatory_changes');
    await db.query('DELETE FROM regulatory_updates');
    await db.query('ALTER TABLE artefact_versions ENABLE TRIGGER immutable_versions');
    await db.query('ALTER TABLE audit_events ENABLE TRIGGER immutable_audit');
  });
  console.log(KEEP ? 'Cleared findings and updates.' : 'Cleared findings, updates and artefacts.');

  if (!KEEP) {
    const reviewer = (await pool.query("SELECT id FROM users WHERE capability='REVIEWER' ORDER BY id LIMIT 1")).rows[0];
    const countRules = id => pool.query(
      `SELECT count(*)::int n FROM internal_rules r JOIN artefact_segments s ON s.id=r.segment_id
       JOIN artefact_versions v ON v.id=s.version_id WHERE v.artefact_id=$1 AND r.concept IS NOT NULL`,
      [id],
    ).then(r => r.rows[0].n);

    for (const [name, type] of OLD_DOCUMENTS) {
      const buffer = await readFile(new URL(encodeURI(name), DIR));
      // Extraction still fails occasionally against a live provider, and a
      // document that yields nothing produces no finding when the amendment
      // lands. Re-ingest rather than open the demo a finding short.
      let artefact;
      let rules = 0;
      for (let attempt = 1; attempt <= 3 && rules === 0; attempt += 1) {
        if (artefact) await discard(pool, artefact.id);
        artefact = await ingest(pool, { buffer, name, type, userId: reviewer.id, extractor, discoverer });
        rules = await countRules(artefact.id);
        if (rules === 0 && attempt < 3) console.log(`  ${name.split('/').pop()} extracted nothing — retrying`);
      }
      const label = name.split('/').pop();
      console.log(`  ingested ${label} — ${rules} rule${rules === 1 ? '' : 's'}${rules === 0 ? '  (no quantitative rule; may still match lexically)' : ''}`);
    }
  }

  console.log('\nReady. Sign in, show the six documents unflagged, then upload an amendment:');
  console.log('  data/amendments/1 - Restraint of Trade (MoneySmart 2024).docx');
  console.log('  data/amendments/2 - Cybersecurity Audit Deadline (Act 19 of 2024).docx');
} finally {
  await pool.end();
}
