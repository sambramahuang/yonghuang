import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPool } from '../backend/src/db.js';
import { fixtureExtractor } from '../backend/src/extract/providers.js';
import { ingest } from '../backend/src/ingest/index.js';
import { intake } from '../backend/src/regulatory/intake.js';
import { analyse } from '../backend/src/impact/match.js';
import { listImpacts, artefactDetail } from '../backend/src/queries.js';
import { submit, approve } from '../backend/src/workflow/review.js';
import { migrate } from './migrate.js';

const pool = createPool();
try {
  await migrate(pool);
  const users = (await pool.query('SELECT * FROM users ORDER BY id')).rows;
  const reviewer = users.find(u => u.capability === 'REVIEWER'), approver = users.find(u => u.capability === 'APPROVER');
  const existing = (await pool.query('SELECT name FROM artefacts')).rows;
  for (const [name,type] of [['employee-handbook.docx','handbook'],['offer-letter-template.docx','template'],['hr-faq.docx','faq'],['hr-system-config.json','config']]) {
    if (existing.some(a => a.name === name)) continue;
    await ingest(pool,{ buffer: await readFile(new URL(`../fixtures/${name}`,import.meta.url)),name,type,userId: reviewer.id,extractor: fixtureExtractor() });
  }
  const update = await intake(pool,JSON.parse(await readFile(new URL('../fixtures/regulatory/sg-rra-2026.json',import.meta.url),'utf8')));
  const analysis = await analyse(pool,update.id);
  let impacts = await listImpacts(pool,{ update_id: update.id });
  console.table(impacts.map(i => ({ id: i.id,status: i.system_status,artefact: i.name,locator: i.locator,resolution: i.resolution ?? 'OPEN' })));
  console.log(`Analysis created ${analysis.created} findings; ${analysis.not_actioned.length} historical segment(s) suppressed.`);
  const patchable = impacts.find(i => i.system_status === 'UPDATE_NEEDED' && i.resolution === null);
  if (patchable) {
    const submitted = patchable.workflow_state === 'SUBMITTED' ? patchable : await submit(pool,patchable.id,reviewer,{ revision: patchable.revision });
    const approved = await approve(pool,patchable.id,approver,{ revision: submitted.revision });
    const artefact = await artefactDetail(pool,patchable.artefact_id);
    assert.equal(artefact.current_version.id,approved.version.id);
    console.log(`Approved finding ${patchable.id}: ${patchable.name} is now version ${approved.version.version}.`);
  }
  const rerun = await analyse(pool,update.id);
  assert.equal(rerun.created,0);
  console.log('Re-running analysis created zero duplicate findings.');
} finally { await pool.end(); }
