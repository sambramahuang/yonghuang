// Drives the real UI in a headless browser and reports what a person would see.
// Run with the backend and `npm run dev` already up:
//   node scripts/ui-check.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.UI_BASE ?? 'http://localhost:5173';
const SHOTS = process.env.UI_SHOTS ?? '/tmp/ui-shots';
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Console errors and failed requests are the "many errors" worth catching.
const consoleErrors = [];
const failedRequests = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));
page.on('requestfailed', r => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));

async function signIn(username, password) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const user = page.locator('#username, input[autocomplete="username"]').first();
  if (await user.count()) {
    await user.fill(username);
    await page.locator('#password, input[type="password"]').first().fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    // Sign-in resolves into the app; wait for the app chrome rather than for
    // network idle, which never settles while details stream in.
    await page.getByRole('button', { name: /sign out/i })
      .waitFor({ state: 'visible', timeout: 30000 })
      .catch(() => {});
  }
}

try {
  // A. Authentication
  await page.goto(BASE, { waitUntil: 'networkidle' });
  record('A1 login screen renders', await page.getByRole('button', { name: /sign in/i }).count() > 0);

  await page.locator('#username, input[autocomplete="username"]').first().fill('rachel');
  await page.locator('#password, input[type="password"]').first().fill('wrongpassword');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('alert').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  const rejected = await page.getByRole('alert').count() > 0;
  record('A2 wrong password is rejected', rejected);

  await signIn('rachel', 'reviewer123');
  const signedIn = await page.getByRole('button', { name: /sign out/i }).count() > 0;
  record('A3 valid sign-in reaches the app', signedIn);
  await page.screenshot({ path: `${SHOTS}/01-list.png`, fullPage: false });

  await page.reload({ waitUntil: 'networkidle' });
  record('A4 session survives reload', await page.getByRole('button', { name: /sign out/i }).count() > 0);

  // B. Document list
  const cards = page.locator('main button').filter({ hasText: /\.docx|\.pdf|\.json/i });
  await cards.first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  const cardCount = await cards.count();
  record('B1 documents are listed', cardCount > 0, `${cardCount} cards`);

  // Overflow: a badge must not extend past its own card.
  let overflow = 0;
  for (let i = 0; i < Math.min(cardCount, 12); i += 1) {
    const card = cards.nth(i);
    const cardBox = await card.boundingBox();
    const badge = card.locator('span').filter({ hasText: /change|uncertain/i }).first();
    if (!cardBox || !(await badge.count())) continue;
    const badgeBox = await badge.boundingBox();
    if (badgeBox && badgeBox.x + badgeBox.width > cardBox.x + cardBox.width + 1) overflow += 1;
  }
  record('B2 status badges stay inside their card', overflow === 0, overflow ? `${overflow} overflowing` : '');

  // No horizontal page scroll.
  const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  record('B3 page does not scroll sideways', !scrolls);

  // C. Document view
  await cards.first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/02-document.png`, fullPage: false });

  const bodyText = await page.locator('main').innerText();
  record('C1 concept ids do not leak into the prose', !/\b[a-z]+_[a-z_]+_(days|years|months|hours|minutes)\b/.test(bodyText),
    (bodyText.match(/\b[a-z]+_[a-z_]+_(days|years|months|hours|minutes)\b/) ?? [''])[0]);

  // Duplicate document names inside one blast-radius list.
  const dupes = await page.evaluate(() => {
    const out = [];
    for (const ul of document.querySelectorAll('ul')) {
      const names = [...ul.querySelectorAll('li')].map(li => li.textContent.trim()).filter(Boolean);
      const seen = new Set();
      for (const n of names) { if (seen.has(n)) { out.push(n); break; } seen.add(n); }
    }
    return out;
  });
  record('C2 blast radius lists no document twice', dupes.length === 0, dupes.slice(0, 2).join(' | '));

  // D. Action buttons
  for (const label of [/summarise changes/i, /blast radius graph/i, /export compliance alert/i]) {
    const button = page.getByRole('button', { name: label }).first();
    const present = await button.count() > 0;
    const enabled = present ? await button.isEnabled() : false;
    record(`D ${label.source.slice(0, 28)} present`, present, enabled ? 'enabled' : 'disabled');
  }

  const summarise = page.getByRole('button', { name: /summarise changes/i }).first();
  if (await summarise.count() && await summarise.isEnabled()) {
    await summarise.click();
    await page.waitForTimeout(900);
    const open = await page.locator('[role="dialog"], .fixed').count() > 0;
    record('D1 summary modal opens', open);
    await page.screenshot({ path: `${SHOTS}/03-summary.png` });
    // Escape does not close this modal; click its own close control, falling
    // back to the backdrop.
    // Dismiss by clicking the backdrop itself, at a point outside the panel.
    const backdrop = page.locator('.fixed.inset-0').first();
    await backdrop.click({ position: { x: 10, y: 10 } }).catch(() => {});
    await backdrop.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  }

  // E. Role gating
  const approveAsReviewer = page.getByRole('button', { name: /^approve/i }).first();
  if (await approveAsReviewer.count()) {
    record('E1 reviewer cannot approve', !(await approveAsReviewer.isEnabled()));
  } else {
    record('E1 reviewer sees no approve control', true, 'no approve button rendered');
  }

  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForTimeout(800);
  await signIn('daniel', 'approver123');
  record('E2 approver can sign in', await page.getByRole('button', { name: /sign out/i }).count() > 0);
  await page.screenshot({ path: `${SHOTS}/04-approver.png` });
} catch (error) {
  record('harness completed', false, error.message);
} finally {
  console.log('\n=== console errors ===');
  console.log(consoleErrors.length ? [...new Set(consoleErrors)].slice(0, 10).map(e => '  ' + e.slice(0, 160)).join('\n') : '  none');
  console.log('=== failed requests ===');
  console.log(failedRequests.length ? [...new Set(failedRequests)].slice(0, 10).map(e => '  ' + e.slice(0, 160)).join('\n') : '  none');
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots in ${SHOTS}`);
  await browser.close();
  process.exitCode = failed ? 1 : 0;
}
