# Yonghuang regulatory impact backend

Node + Express + PostgreSQL implementation of [MVP_ARCHITECTURE.md](MVP_ARCHITECTURE.md). It ingests DOCX/JSON, extracts claims, analyses regulatory changes, proposes numeric patches, and requires a separate approver to create a new version with an audit trail.

The frontend is being built separately. See [the API guide](docs/API.md), [OpenAPI contract](docs/openapi.json), and [JavaScript client](client/api.js).

## Run locally

Requires Node 20.19+ and PostgreSQL 15+. Tested with PostgreSQL 18.

```sh
npm ci
cp .env.example .env
createdb yonghuang
createdb yonghuang_test
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Set `DATABASE_URL`, `TEST_DATABASE_URL` and the generated `AUTH_SECRET` in `.env`. Use a dedicated test database. Add your PostgreSQL username/password/port to the example URLs as needed. Then:

```sh
npm run db:migrate
npm run fixtures
npm test
npm run demo
npm start
```

API: `http://127.0.0.1:3001/api`. Health: `/api/health`. The demo imports four fixtures, prints six expected findings, and submits/approves one open patch. Each subsequent demo run approves another open patch. It skips already-imported fixture filenames and reuses the regulatory update.

With the server running, `npm run smoke` verifies the frontend client over HTTP: health, roles, seeded data, evidence, downloads, authentication and CORS. Regenerate the OpenAPI contract with `npm run openapi` after changing its source in `scripts/openapi.js`.

This development machine already has `.env` configured for the isolated database in `.local/postgres` on port 55432. To restart it after a machine restart:

```sh
/opt/homebrew/opt/postgresql@18/bin/pg_ctl -D .local/postgres -l .local/postgres.log -o '-h 127.0.0.1 -p 55432 -k /private/tmp' start
```

## Seeded accounts

Two accounts are seeded by migration 2: Rachel Tan (REVIEWER) and Daniel Lim (APPROVER). Their
sign-in credentials are written to `backend/config/demo-accounts.md`, which is gitignored — the
passwords are deliberately kept out of the repository and off the login screen.

`POST /api/login` takes `{username, password}` and returns a signed eight-hour bearer token plus the
user record. Passwords are stored as salted scrypt hashes (Node's standard library, no new
dependency); a wrong password and an unknown username return the same 401 message, and sign-in
attempts are throttled per IP. Capabilities come from the database, never from the token.

These are well-known local development credentials, not secrets, and are seeded by migration 2.
Every route except `/api/health` and `/api/login` requires `Authorization: Bearer <token>`.

`npm run token -- reviewer|approver` still mints a token directly, as an operator convenience for
scripting and for the smoke test.

## Extraction

`EXTRACTION_MODE=fixture` replays committed model responses for the exact demo paragraphs. Unknown prose gets LOW extraction confidence and can only generate lexical review leads. Editing an arbitrary fixture sentence does not simulate new AI extraction.

For arbitrary prose, set `EXTRACTION_MODE=live`, `OPENAI_API_KEY` and `OPENAI_MODEL` to a model available to your account that supports structured outputs, then restart. Live extraction uses the Responses API with strict JSON Schema and `store: false`; it does not retry invalid output. Provider failures and unverifiable evidence cannot generate patches. The adapter has mocked transport tests; a live provider request has not been exercised with real credentials. See [OpenAI's structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

JSON semantics are explicitly declared in [config-fields.json](backend/config/config-fields.json). The two demo HR fields represent statutory limits. Unknown filename/path pairs abstain. Filename mappings are demo configuration, not proof of an uploaded file's provenance.

## Verification and scope

`npm test` runs unit tests and real PostgreSQL integration tests, each in a fresh temporary schema. `npm run test:unit` needs no database. Coverage includes exact expected findings, qualifiers, historical and policy cases, RBAC, immutable versions/audit, concurrent analysis/approval, overlapping patch rollback, stale extraction and Unicode offsets.

Implemented: ingestion, validated extraction, structured/lexical matching, evidence detail, patch editing/submission, approval/rejection/escalation, version downloads, audit history and idempotency. See [design decisions](docs/IMPLEMENTATION.md).

MVP limits:

- DOCX imports are normalized text. Original formatting and Word tracked-change export are not preserved; downloads are `.txt`. JSON downloads remain valid JSON.
- Approved versions are not re-extracted. Existing findings preserve original evidence. Later changes against edited artefacts require legal review.
- Future-effective updates can be stored, but analysis is deferred until the effective date.
- Explanations are deterministic descriptions of the actual verdict. The LLM extracts claims only.
- Missing coverage for new duties appears in the analysis response's `gaps` array, outside the segment-based patch workflow.
- The regulatory fixture is a simulated provider payload. Its age changes and effective date agree with [MOM retirement guidance](https://www.mom.gov.sg/employment-practices/retirement) and [re-employment guidance](https://www.mom.gov.sg/employment-practices/re-employment). Its purported gazette date and instrument quotations remain unverified. Intake stores provider evidence without authenticating it.

The original fixture requirements remain in [fixtures/README.md](fixtures/README.md). Runtime config/prompt files are under `backend/`; root copies are reference inputs. Use `npm run db:migrate`, which is transactional and never drops application tables.

## Frontend

The dashboard is a React + TypeScript + Vite app in `frontend/`, wired to the live API.

```sh
cd frontend
npm install
npm run dev
```

It expects the backend on `http://127.0.0.1:3001/api` (override with `VITE_API_BASE`) and must
be served from `http://localhost:5173`, the origin the backend's CORS allows. If Vite reports
that port is in use it will pick another one, and requests will then be blocked by CORS — free
5173 rather than accepting the fallback.

There is no login route by design. Mint a token with `npm run token -- reviewer` (or `approver`)
and paste it into the prompt on first load; it is kept in `localStorage`. "Switch" clears it, which
is how you move between the reviewer and approver roles to demonstrate separation of duties.

The queue lists findings for the selected regulatory update, filterable by system status. Selecting
one shows both evidence spans with the matched text highlighted in place, the regulator's own
wording, and — where no patch was proposed — the specific competence-boundary reasons why.
Reviewers edit and submit the redline; a different user with APPROVER capability approves it, which
writes a new artefact version. The audit trail is shown beneath.
