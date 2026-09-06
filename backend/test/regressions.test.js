import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { migrate } from '../../scripts/migrate.js';
import { fixtureExtractor } from '../src/extract/providers.js';
import { ingest } from '../src/ingest/index.js';
import { intake } from '../src/regulatory/intake.js';
import { analyse } from '../src/impact/match.js';
import { editPatch, submit, approve } from '../src/workflow/review.js';
import { artefactDetail, listImpacts } from '../src/queries.js';
import { Document, Packer, Paragraph } from 'docx';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required');
const payload = JSON.parse(await readFile(new URL('../../fixtures/regulatory/sg-rra-2026.json',import.meta.url),'utf8'));
async function dbFor(t) {
  const schema = `regression_${randomBytes(8).toString('hex')}`;
  const admin = new pg.Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = new pg.Pool({ connectionString: url,options: `-c search_path=${schema}` });
  t.after(async () => { await db.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await migrate(db);
  return db;
}
const reviewer = { id: '1',capability: 'REVIEWER' }, approver = { id: '2',capability: 'APPROVER' };
async function seedConfig(db) {
  await ingest(db,{ buffer: await readFile(new URL('../../fixtures/hr-system-config.json',import.meta.url)),name: 'hr-system-config.json',type: 'config',userId: reviewer.id,extractor: fixtureExtractor() });
  const u = await intake(db,payload); await analyse(db,u.id);
  return { u,impacts: await listImpacts(db,{ update_id: u.id }) };
}
test('analysis concurrency and repeated migration preserve records without duplication',async t => {
  const db = await dbFor(t); await seedConfig(db);
  const u = await intake(db,{ ...payload,provider_ref: 'concurrent' });
  const results = await Promise.all([analyse(db,u.id),analyse(db,u.id)]);
  assert.deepEqual(results.map(r => r.created).sort(),[0,2]);
  await migrate(db);
  assert.equal((await listImpacts(db,{})).length,4);
});
test('overlapping approved changes fail atomically and retain current version',async t => {
  const db = await dbFor(t); const { impacts } = await seedConfig(db);
  const otherUpdate = await intake(db,{ ...payload,provider_ref: 'another-source' });
  await analyse(db,otherUpdate.id);
  const first = impacts.find(i => i.locator.endsWith('retirementAge'));
  const second = (await listImpacts(db,{ update_id: otherUpdate.id })).find(i => i.locator.endsWith('retirementAge'));
  const a = await submit(db,first.id,reviewer,{ revision: 1 });
  const b = await submit(db,second.id,reviewer,{ revision: 1 });
  await approve(db,a.id,approver,{ revision: a.revision });
  await assert.rejects(approve(db,b.id,approver,{ revision: b.revision }),/overlaps/);
  assert.equal((await db.query('SELECT count(*) FROM artefact_versions')).rows[0].count,'2');
  assert.equal((await db.query('SELECT resolution FROM impact_results WHERE id=$1',[b.id])).rows[0].resolution,null);
});
test('new regulatory update does not propose patches against unextracted approved versions',async t => {
  const db = await dbFor(t); const { impacts,u } = await seedConfig(db);
  const i = await submit(db,impacts[0].id,reviewer,{ revision: 1 });
  await approve(db,i.id,approver,{ revision: i.revision });
  assert.equal((await analyse(db,u.id)).created,0);
  const later = await intake(db,{ ...payload,provider_ref: 'later-update' });
  await analyse(db,later.id);
  const findings = await listImpacts(db,{ update_id: later.id });
  assert.ok(findings.every(i => i.system_status === 'LEGAL_REVIEW_REQUIRED' && !i.proposed_patch));
});
test('editing a submitted patch invalidates submission and rejects stale approval',async t => {
  const db = await dbFor(t); const { impacts } = await seedConfig(db);
  const i = await submit(db,impacts[0].id,reviewer,{ revision: 1 });
  const edited = await editPatch(db,i.id,reviewer,{ revision: i.revision,new: '100' });
  assert.equal(edited.workflow_state,'DRAFT'); assert.equal(edited.submitted_by,null);
  await assert.rejects(approve(db,i.id,approver,{ revision: i.revision }),/revision is stale/);
  await assert.rejects(approve(db,i.id,approver,{ revision: edited.revision }),/submitted patch/);
});
test('unsupported duty change stays review-only and absent duties surface as gaps',async t => {
  const db = await dbFor(t); await seedConfig(db);
  const u = await intake(db,{ ...payload,provider_ref: 'duties',changes: [
    { ...payload.changes[0],change_type: 'SCOPE_CHANGED' },
    { concept: 'paternity_leave_weeks',change_type: 'DUTY_ADDED',old_value: null,new_value: 4,unit: 'weeks',source_span: 'Demo duty' },
  ] });
  const result = await analyse(db,u.id);
  assert.equal(result.gaps.length,1); assert.equal(result.gaps[0].concept,'paternity_leave_weeks');
  const impacts = await listImpacts(db,{ update_id: u.id });
  assert.equal(impacts[0].system_status,'LEGAL_REVIEW_REQUIRED'); assert.equal(impacts[0].proposed_patch,null);
});
test('UNMAPPED extraction permits lexical leads without permitting patches',async t => {
  const db = await dbFor(t);
  const text = 'The retirement age is 63.';
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] }));
  await ingest(db,{ buffer,name: 'unmapped.docx',type: 'handbook',userId: reviewer.id,extractor: async () => [{
    concept: null,modality: 'IS',operator: '=',value: 63,unit: 'years',assertion_type: 'STATES_LAW',temporal_frame: 'PRESENT',
    applies_to_condition: null,evidence_quote: text,extraction_confidence: 'LOW',
  }] });
  const u = await intake(db,payload); await analyse(db,u.id);
  const impacts = await listImpacts(db,{});
  assert.equal(impacts.length,1); assert.equal(impacts[0].evidence_tier,'LEXICAL'); assert.equal(impacts[0].proposed_patch,null);
});
test('UTF-16 offsets remain correct through DOCX extraction and approval',async t => {
  const db = await dbFor(t);
  const text = '😀 The statutory retirement age is 63.';
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] }));
  await ingest(db,{ buffer,name: 'unicode.docx',type: 'handbook',userId: reviewer.id,extractor: async () => [{
    concept: 'retirement_age',modality: 'IS',operator: '=',value: 63,unit: 'years',assertion_type: 'STATES_LAW',temporal_frame: 'PRESENT',
    applies_to_condition: null,evidence_quote: text,extraction_confidence: 'HIGH',
  }] });
  const u = await intake(db,payload); await analyse(db,u.id);
  const i = (await listImpacts(db,{}))[0];
  const s = await submit(db,i.id,reviewer,{ revision: i.revision });
  const result = await approve(db,i.id,approver,{ revision: s.revision });
  assert.ok(result.version.raw_text.includes('😀 The statutory retirement age is 64.'));
});
test('a document ingested after the amendment already exists is flagged immediately, without a manual analyse',async t => {
  const db = await dbFor(t);
  const stale = () => [{
    concept: 'retirement_age',modality: 'IS',operator: '=',value: 63,unit: 'years',assertion_type: 'STATES_LAW',temporal_frame: 'PRESENT',
    applies_to_condition: null,evidence_quote: 'The retirement age is 63.',extraction_confidence: 'HIGH',
  }];
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('The retirement age is 63.')] }] }));
  // Document A predates the amendment: ingesting it now finds nothing to check against yet.
  const a = await ingest(db,{ buffer,name: 'doc-a.docx',type: 'handbook',userId: reviewer.id,extractor: stale });
  assert.equal(a.findings_created,0);
  const u = await intake(db,payload);
  await analyse(db,u.id);
  const afterAmendment = await listImpacts(db,{});
  assert.equal(afterAmendment.length,1);
  assert.equal(afterAmendment[0].name,'doc-a.docx');
  // Document B is ingested only now, after the amendment is already on file.
  // Its ingest call must catch the same stale claim on its own — no separate analyse().
  const b = await ingest(db,{ buffer,name: 'doc-b.docx',type: 'template',userId: reviewer.id,extractor: stale });
  assert.equal(b.findings_created,1);
  const impacts = await listImpacts(db,{});
  assert.equal(impacts.length,2);
  const flaggedB = impacts.find(i => i.name === 'doc-b.docx');
  assert.equal(flaggedB.system_status,'UPDATE_NEEDED');
  assert.ok(flaggedB.proposed_patch);
  // The finding is only proposed, never applied: B's own text is untouched.
  const detail = await artefactDetail(db,b.id);
  assert.ok(detail.current_version.raw_text.includes('63'));
});
