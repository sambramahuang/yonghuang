import assert from 'node:assert/strict';
import { createApi } from '../client/api.js';
import { signToken } from '../backend/src/auth/rbac.js';

const baseUrl = `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? 3001}/api`;
const api = createApi({ baseUrl,getToken: () => signToken('1',process.env.AUTH_SECRET) });
const health = await api.health();
assert.equal(health.status,'ok');
assert.equal((await api.me()).capability,'REVIEWER');
assert.equal((await api.users()).length,2);
const artefacts = await api.artefacts();
const updates = await api.updates();
const impacts = await api.impacts();
assert.ok(artefacts.length >= 4 && updates.length >= 1 && impacts.length >= 6,'Run npm run demo before smoke');
for (const i of impacts) {
  const detail = await api.impact(i.id);
  assert.equal(detail.evidence_raw_text.slice(detail.evidence.start,detail.evidence.end),detail.evidence.quote);
}
const config = artefacts.find(a => a.format === 'JSON');
assert.ok(JSON.parse(await (await api.download(config.id)).text()).hr);
const doc = artefacts.find(a => a.format === 'DOCX');
assert.ok((await (await api.download(doc.id)).text()).length > 0);
const preflight = await fetch(`${baseUrl}/impacts`,{ method: 'OPTIONS',headers: { Origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' } });
assert.equal(preflight.status,204);
assert.equal(preflight.headers.get('access-control-allow-origin'),process.env.CORS_ORIGIN ?? 'http://localhost:5173');
const unauthenticated = await fetch(`${baseUrl}/impacts`);
assert.equal(unauthenticated.status,401);
console.log(`HTTP smoke passed: ${artefacts.length} artefacts, ${impacts.length} findings, evidence, downloads, auth and frontend CORS verified (${health.extraction_mode} mode).`);
