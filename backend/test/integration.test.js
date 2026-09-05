import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import request from 'supertest';
import { Document, Packer, Paragraph } from 'docx';
import { migrate } from '../../scripts/migrate.js';
import { createApp } from '../src/app.js';
import { fixtureExtractor } from '../src/extract/providers.js';
import { signToken } from '../src/auth/rbac.js';

const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) throw new Error('TEST_DATABASE_URL is required. Use a dedicated test database; see README.md.');
const secret = randomBytes(32).toString('hex');
const payload = JSON.parse(await readFile(new URL('../../fixtures/regulatory/sg-rra-2026.json',import.meta.url),'utf8'));
const fixtures = [['employee-handbook.docx','handbook'],['offer-letter-template.docx','template'],['hr-faq.docx','faq'],['hr-system-config.json','config'],['employment-negotiation-playbook.docx','playbook']];
const baseRule = text => ({ concept: 'retirement_age',modality: 'IS',operator: '=',value: 63,unit: 'years',assertion_type: 'STATES_LAW',temporal_frame: 'PRESENT',applies_to_condition: null,evidence_quote: text,extraction_confidence: 'HIGH' });
async function harness(t,extractor = fixtureExtractor()) {
  const schema = `test_${randomBytes(8).toString('hex')}`;
  const admin = new pg.Pool({ connectionString: dbUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: dbUrl,options: `-c search_path=${schema}`,max: 10 });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await migrate(pool);
  const app = createApp({ pool,secret,extractor });
  const reviewer = signToken('1',secret), approver = signToken('2',secret);
  const api = (method,url,role = 'reviewer') => request(app)[method](url).auth(role === 'approver' ? approver : reviewer,{ type: 'bearer' });
  async function seed() {
    for (const [name,type] of fixtures) {
      await api('post','/api/artefacts').field('type',type).attach('file',await readFile(new URL(`../../fixtures/${name}`,import.meta.url)),name).expect(201);
    }
    const update = await api('post','/api/regulatory-updates').send(payload).expect(201);
    const analysis = await api('post',`/api/regulatory-updates/${update.body.id}/analyse`).expect(200);
    const impacts = await api('get',`/api/impacts?update_id=${update.body.id}`).expect(200);
    return { update: update.body,analysis: analysis.body,impacts: impacts.body };
  }
  async function uploadText(text,name = 'custom.docx') {
    const buffer = await Packer.toBuffer(new Document({ sections: [{ children: text.split('\n').map(line => new Paragraph(line)) }] }));
    return (await api('post','/api/artefacts').field('type','handbook').attach('file',buffer,name).expect(201)).body;
  }
  return { pool,app,api,seed,uploadText,reviewer,approver };
}

test('demo fixture set yields exactly seven expected findings, with exact evidence',async t => {
  const h = await harness(t);
  const { analysis,impacts,update } = await h.seed();
  assert.equal(analysis.created,7);
  assert.deepEqual(impacts.map(i => `${i.system_status}:${i.name}:${i.locator}`).sort(),[
    'UPDATE_NEEDED:employee-handbook.docx:p.3','UPDATE_NEEDED:offer-letter-template.docx:p.3',
    'UPDATE_NEEDED:hr-system-config.json:$.hr.retirementAge','UPDATE_NEEDED:hr-system-config.json:$.hr.reemploymentAge',
    'POSSIBLE_IMPACT:hr-faq.docx:p.3','LEGAL_REVIEW_REQUIRED:hr-faq.docx:p.4',
    // The playbook's retirement clause flags; its indemnity clause must not,
    // since no concept covers liability caps.
    'UPDATE_NEEDED:employment-negotiation-playbook.docx:p.3',
  ].sort());
  assert.equal(analysis.not_actioned.length,1); assert.equal(analysis.not_actioned[0].reason,'HISTORICAL');
  for (const i of impacts) {
    const detail = (await h.api('get',`/api/impacts/${i.id}`).expect(200)).body;
    assert.equal(detail.evidence_raw_text.slice(detail.evidence.start,detail.evidence.end),detail.evidence.quote);
    assert.ok(detail.change.source_span);
    if (i.system_status !== 'UPDATE_NEEDED') assert.equal(i.proposed_patch,null);
  }
  assert.equal((await h.api('post',`/api/regulatory-updates/${update.id}/analyse`).expect(200)).body.created,0);
});
test('reviewer edits and submits; separate approver creates immutable version and audit',async t => {
  const h = await harness(t); const { impacts,update } = await h.seed();
  const i = impacts.find(i => i.name === 'employee-handbook.docx');
  await h.api('post',`/api/impacts/${i.id}/approve`,'approver').send({ revision: 1 }).expect(409);
  const edited = (await h.api('patch',`/api/impacts/${i.id}/patch`).send({ revision: 1,new: '64' }).expect(200)).body;
  await h.api('post',`/api/impacts/${i.id}/submit`).send({ revision: 1 }).expect(409);
  const submitted = (await h.api('post',`/api/impacts/${i.id}/submit`).send({ revision: edited.revision }).expect(200)).body;
  await h.api('post',`/api/impacts/${i.id}/approve`).send({ revision: submitted.revision }).expect(403);
  const approved = (await h.api('post',`/api/impacts/${i.id}/approve`,'approver').send({ revision: submitted.revision }).expect(200)).body;
  assert.equal(approved.version.version,2);
  assert.ok(approved.version.raw_text.includes('The statutory retirement age is 64.'));
  assert.ok(approved.version.raw_text.includes('Before 1 July 2026, the statutory retirement age was 63.'));
  const detail = (await h.api('get',`/api/impacts/${i.id}`)).body;
  assert.deepEqual(detail.audit.map(a => a.action),['PATCH_EDITED','SUBMITTED','APPROVED']);
  assert.equal(detail.system_status,'UPDATE_NEEDED'); assert.equal(detail.resolution,'ACCEPTED');
  await assert.rejects(h.pool.query("UPDATE artefact_versions SET raw_text='tampered' WHERE id=$1",[approved.version.id]),/immutable/);
  await assert.rejects(h.pool.query('DELETE FROM audit_events WHERE impact_id=$1',[i.id]),/immutable/);
  await h.api('post',`/api/impacts/${i.id}/approve`,'approver').send({ revision: submitted.revision }).expect(409);
  assert.equal((await h.api('post',`/api/regulatory-updates/${update.id}/analyse`)).body.created,0);
});
test('approver cannot approve own edit or own submission and DB enforces separation',async t => {
  const h = await harness(t); const { impacts } = await h.seed();
  const i = impacts.find(i => i.proposed_patch);
  const edited = (await h.api('patch',`/api/impacts/${i.id}/patch`,'approver').send({ revision: 1,new: '64' }).expect(200)).body;
  const submitted = (await h.api('post',`/api/impacts/${i.id}/submit`).send({ revision: edited.revision }).expect(200)).body;
  await h.api('post',`/api/impacts/${i.id}/approve`,'approver').send({ revision: submitted.revision }).expect(403);
  await assert.rejects(h.pool.query('UPDATE impact_results SET approved_by=edited_by WHERE id=$1',[i.id]),/check constraint/);
  const other = impacts.find(x => x.proposed_patch && x.id !== i.id);
  const own = (await h.api('post',`/api/impacts/${other.id}/submit`,'approver').send({ revision: 1 }).expect(200)).body;
  await h.api('post',`/api/impacts/${other.id}/approve`,'approver').send({ revision: own.revision }).expect(403);
});
test('two simultaneous approvals on JSON preserve both values across length-changing edits',async t => {
  const h = await harness(t); const { impacts } = await h.seed();
  const config = impacts.filter(i => i.name === 'hr-system-config.json');
  const ready = [];
  for (const i of config) {
    const value = i.locator.endsWith('retirementAge') ? '100' : '69';
    const edited = (await h.api('patch',`/api/impacts/${i.id}/patch`).send({ revision: 1,new: value }).expect(200)).body;
    ready.push((await h.api('post',`/api/impacts/${i.id}/submit`).send({ revision: edited.revision }).expect(200)).body);
  }
  await Promise.all(ready.map(i => h.api('post',`/api/impacts/${i.id}/approve`,'approver').send({ revision: i.revision }).expect(200)));
  const artefact = (await h.api('get',`/api/artefacts/${config[0].artefact_id}`).expect(200)).body;
  assert.equal(artefact.current_version.version,3);
  assert.deepEqual(JSON.parse(artefact.current_version.raw_text),{ hr: { retirementAge: 100,reemploymentAge: 69 } });
  assert.equal(artefact.versions.length,3);
});
test('duplicate simultaneous approvals apply once and rollback the second attempt',async t => {
  const h = await harness(t); const { impacts } = await h.seed(); const i = impacts.find(i => i.proposed_patch);
  const submitted = (await h.api('post',`/api/impacts/${i.id}/submit`).send({ revision: 1 })).body;
  const results = await Promise.all([1,2].map(() => h.api('post',`/api/impacts/${i.id}/approve`,'approver').send({ revision: submitted.revision })));
  assert.deepEqual(results.map(r => r.status).sort(),[200,409]);
  assert.equal((await h.api('get',`/api/artefacts/${i.artefact_id}`)).body.versions.length,2);
});
test('policy rejection and legal escalation resolve findings without writing versions',async t => {
  const h = await harness(t); const { impacts } = await h.seed();
  const policy = impacts.find(i => i.system_status === 'POSSIBLE_IMPACT'), legal = impacts.find(i => i.system_status === 'LEGAL_REVIEW_REQUIRED');
  for (const i of [policy,legal]) {
    await h.api('patch',`/api/impacts/${i.id}/patch`).send({ revision: 1,new: '69' }).expect(409);
    await h.api('post',`/api/impacts/${i.id}/submit`).send({ revision: 1 }).expect(409);
  }
  await h.api('post',`/api/impacts/${policy.id}/reject`).send({ revision: 1,rejection_reason: 'POLICY_EXCEEDS' }).expect(403);
  await h.api('post',`/api/impacts/${policy.id}/reject`,'approver').send({ revision: 1,rejection_reason: 'POLICY_EXCEEDS' }).expect(200);
  await h.api('post',`/api/impacts/${legal.id}/escalate`).send({ revision: 1,note: 'Counsel should assess medical-fitness condition.' }).expect(200);
  // One version per ingested artefact and no more: neither rejection nor
  // escalation may write a new version.
  const artefacts = (await h.pool.query('SELECT count(*) FROM artefacts')).rows[0].count;
  assert.equal((await h.pool.query('SELECT count(*) FROM artefact_versions')).rows[0].count,artefacts);
});
test('authentication rejects missing, forged, expired and unknown-user tokens',async t => {
  const h = await harness(t);
  await request(h.app).get('/api/health').expect(200);
  for (const token of ['',h.reviewer.slice(0,-1) + '!',signToken('1',secret,-1),signToken('999',secret)]) {
    await request(h.app).get('/api/artefacts').set('Authorization',`Bearer ${token}`).expect(401);
  }
  await h.api('get','/api/me').expect(200);
});
test('intake is idempotent but conflicting content, invalid dates and future analysis are refused',async t => {
  const h = await harness(t);
  const first = (await h.api('post','/api/regulatory-updates').send(payload).expect(201)).body;
  assert.equal((await h.api('post','/api/regulatory-updates').send(payload).expect(200)).body.id,first.id);
  await h.api('post','/api/regulatory-updates').send({ ...payload,title: 'Different update' }).expect(409);
  await h.api('post','/api/regulatory-updates').send({ ...payload,effective_date: '2026-02-30' }).expect(400);
  const future = (await h.api('post','/api/regulatory-updates').send({ ...payload,provider_ref: 'future',effective_date: '2099-01-01' }).expect(201)).body;
  await h.api('post',`/api/regulatory-updates/${future.id}/analyse`).expect(409);
});
test('lexical fallback requires alias and complete numeric value, never a patch',async t => {
  const h = await harness(t,async () => []);
  await h.uploadText('Review the retirement age 63.\nRefer to clause 63.\nRetirement age 163.\nRetirement age 63.5.\nRetirement age 63A.\nRetirement age -63.');
  const u = (await h.api('post','/api/regulatory-updates').send(payload)).body;
  await h.api('post',`/api/regulatory-updates/${u.id}/analyse`).expect(200);
  const results = (await h.api('get','/api/impacts')).body;
  assert.equal(results.length,1); assert.equal(results[0].evidence_tier,'LEXICAL'); assert.equal(results[0].proposed_patch,null);
});
test('already-current claim and stale claim yield exactly one open finding',async t => {
  const h = await harness(t,async s => [{ ...baseRule(s.text),value: s.text.includes('64') ? 64 : 63 }]);
  await h.uploadText('The statutory retirement age is 64.','handbook.docx');
  await h.uploadText('Employment continues until the statutory retirement age of 63.','offer.docx');
  const u = (await h.api('post','/api/regulatory-updates').send(payload)).body;
  await h.api('post',`/api/regulatory-updates/${u.id}/analyse`).expect(200);
  const open = (await h.api('get','/api/impacts?open=true')).body;
  assert.equal(open.length,1); assert.equal(open[0].name,'offer.docx');
  assert.equal((await h.api('get','/api/impacts?status=CURRENT')).body.length,1);
});
test('qualifiers and low-confidence extraction block patches even if provider calls them simple law',async t => {
  const h = await harness(t,async s => [{ ...baseRule(s.text),extraction_confidence: s.text.startsWith('Maybe') ? 'LOW' : 'HIGH' }]);
  await h.uploadText('The statutory retirement age is 63, unless an exception applies.\nMaybe the retirement age is 63.');
  const u = (await h.api('post','/api/regulatory-updates').send(payload)).body;
  await h.api('post',`/api/regulatory-updates/${u.id}/analyse`).expect(200);
  const impacts = (await h.api('get','/api/impacts')).body;
  assert.equal(impacts.length,2); assert.ok(impacts.every(i => i.system_status === 'LEGAL_REVIEW_REQUIRED' && !i.proposed_patch));
});
test('unknown config filenames have no inferred statutory rules; uploads validate content',async t => {
  const h = await harness(t);
  const unknown = await h.api('post','/api/artefacts').field('type','config').attach('file',Buffer.from('{"hr":{"retirementAge":63}}'),'policy.json').expect(201);
  assert.equal(unknown.body.rule_count,0);
  await h.api('post','/api/artefacts').field('type','config').attach('file',Buffer.from('{bad}'),'broken.json').expect(400);
  await h.api('post','/api/artefacts').field('type','handbook').attach('file',Buffer.from('not a zip'),'broken.docx').expect(400);
  await h.api('post','/api/artefacts').field('type','handbook').attach('file',Buffer.from('pdf'),'file.pdf').expect(415);
});

test('password sign-in issues a working token, hides which credential was wrong, and preserves RBAC', async t => {
  const { app, seed } = await harness(t);
  const login = (username,password) => request(app).post('/api/login').send({ username,password });

  // Seeded demo accounts sign in and receive their real capability.
  const rachel = await login('rachel','reviewer123').expect(200);
  assert.equal(rachel.body.user.capability,'REVIEWER');
  assert.ok(rachel.body.token);
  const daniel = await login('daniel','approver123').expect(200);
  assert.equal(daniel.body.user.capability,'APPROVER');

  // Usernames are matched case-insensitively.
  await login('RACHEL','reviewer123').expect(200);

  // A wrong password and an unknown user are indistinguishable to the caller.
  const wrongPassword = await login('rachel','nope').expect(401);
  const unknownUser = await login('ghost','nope').expect(401);
  assert.equal(wrongPassword.body.error,unknownUser.body.error);

  await login('rachel','').expect(401);
  await request(app).post('/api/login').send({}).expect(400);

  // The issued token authenticates real requests and still carries only its
  // own capability: signing in as a reviewer never grants approval rights.
  const me = await request(app).get('/api/me').auth(rachel.body.token,{ type: 'bearer' }).expect(200);
  assert.equal(me.body.capability,'REVIEWER');
  const { impacts } = await seed();
  const open = impacts.find(i => i.system_status === 'UPDATE_NEEDED');
  await request(app).post(`/api/impacts/${open.id}/approve`).auth(rachel.body.token,{ type: 'bearer' })
    .send({ revision: open.revision }).expect(403);

  // Password hashes are never returned by any user-facing route.
  const users = await request(app).get('/api/users').auth(rachel.body.token,{ type: 'bearer' }).expect(200);
  for (const row of users.body) assert.equal(row.password_hash,undefined);
});
