/**
 * Walks the demo exactly as it will be presented, in a real browser, against
 * the real backend and the real files.
 *
 * Unit tests replay recorded model responses, so they never see a typographic
 * apostrophe or a rate-limited request. This does: it is the only check that
 * exercises what a person actually does on stage.
 *
 *   node --env-file-if-exists=.env scripts/demo-walkthrough.mjs
 *
 * Assumes `npm start` and `npm run dev` are running, and that
 * scripts/demo-reset.mjs has been run to restore the opening state.
 */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = process.env.UI_BASE ?? 'http://localhost:5173';
const API = process.env.API_BASE ?? 'http://127.0.0.1:3001/api';
const SHOTS = process.env.UI_SHOTS ?? '/tmp/demo-shots';
// Both amendments, in the order the demo uploads them.
const AMENDMENTS = [
  '1 - Restraint of Trade (MoneySmart 2024).docx',
  '2 - Cybersecurity Audit Deadline (Act 19 of 2024).docx',
].map(name => fileURLToPath(new URL(`../data/amendments/${name}`, import.meta.url)));

const steps = [];
const step = (name, ok, detail = '') => {
  steps.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function token(username, password) {
  const res = await fetch(`${API}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return (await res.json()).token;
}
const get = async (path, tok) =>
  (await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${tok}` } })).json();

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));

async function signIn(username, password) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const field = page.locator('#username').first();
  if (await field.count()) {
    await field.fill(username);
    await page.locator('#password').first().fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await page.getByRole('button', { name: /sign out/i }).waitFor({ timeout: 45000 });
}

const cards = () => page.locator('main button').filter({ hasText: /\.docx|\.pdf|\.json/i });

try {
  const reviewer = await token('rachel', 'reviewer123');
  const approver = await token('daniel', 'approver123');
  step('0 both demo accounts sign in', !!reviewer && !!approver);

  // ---- Act 1: the old documents, before any change ----
  const before = await get('/impacts', reviewer);
  step('1a no findings before the amendment', before.length === 0, `${before.length} findings`);

  const artefacts = await get('/artefacts', reviewer);
  step('1b the old documents are loaded', artefacts.length >= 3, artefacts.map(a => a.name.slice(0, 22)).join(', '));

  await signIn('rachel', 'reviewer123');
  await cards().first().waitFor({ timeout: 45000 });
  const cardCount = await cards().count();
  step('1c documents render in the list', cardCount >= 3, `${cardCount} cards`);
  await page.screenshot({ path: `${SHOTS}/1-before.png` });

  // Every document should read as unaffected at this point.
  const beforeText = await page.locator('main').innerText();
  step('1d nothing is flagged yet', !/\d+ clauses? flagged/i.test(beforeText));

  // Opening one shows its full text, not just a flagged fragment.
  await cards().first().click();
  await page.waitForTimeout(1500);
  const paragraphs = await page.locator('main p').count();
  step('1e a document opens in full', paragraphs > 5, `${paragraphs} paragraphs`);
  await page.screenshot({ path: `${SHOTS}/2-document-before.png` });

  // ---- Act 2: the amendments land ----
  const uploads = [];
  for (const path of AMENDMENTS) {
    const form = new FormData();
    form.append('file', new File([await readFile(path)], path.split('/').pop()));
    uploads.push(await (await fetch(`${API}/regulatory-updates/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${reviewer}` }, body: form,
    })).json());
  }
  step('2a both amendments are read and stored', uploads.every(u => u.created === true),
    uploads.map(u => u.error ?? `update ${u.update_id}`).join('; '));
  step('2b a change was extracted from each', uploads.every(u => u.changes_found > 0),
    uploads.map(u => `${u.changes_found}`).join(' + ') + ' change(s)');
  const totalFindings = uploads.reduce((n, u) => n + (u.findings_created ?? 0), 0);
  step('2c multiple documents are flagged at once', totalFindings >= 4, `${totalFindings} findings`);

  const after = await get('/impacts', reviewer);
  const affected = new Set(after.map(i => i.name));
  step('2d findings span several documents', affected.size >= 3, [...affected].map(n => n.slice(0, 22)).join(', '));

  // Documents a change does not touch must stay clean; that restraint is the
  // point of the demo as much as the flagging is.
  const untouched = ['JUNIOR STAFF', 'Vendor Due Diligence'];
  step('2g unaffected documents stay clean',
    untouched.every(name => ![...affected].some(a => a.includes(name))),
    [...affected].join(', '));

  // Explanations must describe the clause, not recite boundary categories.
  const boilerplate = after.filter(i => /crosses the competence boundary/.test(i.explanation));
  step('2e explanations are clause-specific', boilerplate.length === 0,
    boilerplate.length ? `${boilerplate.length} boilerplate` : '');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await cards().first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(2500);
  const afterText = await page.locator('main').innerText();
  step('2f the list now shows flagged documents', /clauses? flagged/i.test(afterText));
  await page.screenshot({ path: `${SHOTS}/3-after-amendment.png` });

  // ---- Act 3: the reviewer edits a suggestion ----
  const editable = after.find(i => i.proposed_patch);
  if (editable) {
    const rewritten = 'Reviewer rewrite: the notice period for confirmed employees is two (2) months.';
    const patched = await (await fetch(`${API}/impacts/${editable.id}/patch`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${reviewer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: editable.revision, new: rewritten }),
    })).json();
    step('3a a reviewer can rewrite the suggestion', patched.proposed_patch?.new === rewritten, patched.error ?? '');
    step('3b the rewrite is recorded as human-authored', patched.proposed_patch?.drafted_by === 'HUMAN');

    // ---- Act 4: separation of duties, then approval ----
    const submitted = await (await fetch(`${API}/impacts/${editable.id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${reviewer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: patched.revision }),
    })).json();
    step('4a the reviewer submits it', submitted.workflow_state === 'SUBMITTED', submitted.error ?? '');

    const selfApprove = await fetch(`${API}/impacts/${editable.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${reviewer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: submitted.revision }),
    });
    step('4b the same person cannot approve their own edit', selfApprove.status === 403, `HTTP ${selfApprove.status}`);

    const approved = await (await fetch(`${API}/impacts/${editable.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${approver}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: submitted.revision }),
    })).json();
    step('4c a second person approves it', approved.impact?.resolution === 'ACCEPTED', approved.error ?? '');
    step('4d approval writes a new version', !!approved.version?.id, approved.version ? `v${approved.version.version}` : '');
    step('4e the reviewer\'s wording is in the document', (approved.version?.raw_text ?? '').includes(rewritten));

    const audit = (await get(`/impacts/${editable.id}`, reviewer)).audit ?? [];
    const actions = audit.map(a => a.action);
    step('4f the audit trail records who did what', actions.includes('SUBMITTED') && actions.includes('APPROVED'),
      actions.join(' → '));
  } else {
    step('3a a finding carries an editable suggestion', false, 'no finding had a proposed patch');
  }

  // ---- Act 5: re-running changes nothing ----
  const updates = await get('/regulatory-updates', reviewer);
  const reanalyse = await (await fetch(`${API}/regulatory-updates/${updates[0].id}/analyse`, {
    method: 'POST', headers: { Authorization: `Bearer ${reviewer}` },
  })).json();
  step('5a re-running analysis creates no duplicates', reanalyse.created === 0, `created ${reanalyse.created}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await cards().first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/4-after-approval.png` });
  step('5b the app still renders after approval', await page.getByRole('button', { name: /sign out/i }).count() > 0);
} catch (error) {
  step('walkthrough completed', false, error.message.slice(0, 160));
} finally {
  console.log('\n=== console errors ===');
  console.log(consoleErrors.length ? [...new Set(consoleErrors)].slice(0, 8).map(e => '  ' + e.slice(0, 150)).join('\n') : '  none');
  const failed = steps.filter(s => !s.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} demo steps passed. Screenshots in ${SHOTS}`);
  if (failed.length) console.log('FAILED:\n' + failed.map(f => `  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`).join('\n'));
  await browser.close();
  process.exitCode = failed.length ? 1 : 0;
}
