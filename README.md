# Yonghuang regulatory impact backend

Node + Express + PostgreSQL implementation of [MVP_ARCHITECTURE.md](MVP_ARCHITECTURE.md). It ingests DOCX/PDF/JSON firm artefacts (handbooks, templates, FAQs, config, training material, playbooks), extracts claims, analyses regulatory changes, proposes numeric patches, and requires a separate approver to create a new version with an audit trail.

A regulatory update can be logged two ways: `POST /api/regulatory-updates` takes the structured
JSON payload the schema requires, or `POST /api/regulatory-updates/upload` takes a DOCX/PDF of the
actual judgment, amendment, or circular — the model reads it, proposes the same structured shape,
and that proposal is re-validated by the same checks a hand-written submission goes through before
anything is stored. Either path analyses immediately, flagging every artefact in the system that
the change actually affects.

See [the architecture diagrams](docs/ARCHITECTURE.md) for the system, data-flow, workflow and data-model views. See [Frontend](#frontend) below for the React app, and [the API guide](docs/API.md), [OpenAPI contract](docs/openapi.json), and [JavaScript client](client/api.js) for the API itself.

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

Implemented: ingestion, validated extraction, structured/lexical matching, evidence detail, patch editing/submission, approval/rejection/escalation, version downloads, audit history and idempotency. A finding that needs legal review also gets a model-drafted, clause-specific explanation of why (falling back to the deterministic boundary sentence on a decline or error) alongside any drafted replacement text — both are explicitly marked unverified. See [design decisions](docs/IMPLEMENTATION.md).

MVP limits:

- DOCX and PDF imports are normalized to plain text. Original formatting and Word tracked-change export are not preserved; downloads are `.txt`. JSON downloads remain valid JSON.
- Approved versions are not re-extracted. Existing findings preserve original evidence. Later changes against edited artefacts require legal review.
- Future-effective updates can be stored, but analysis is deferred until the effective date.
- Explanations are deterministic descriptions of the actual verdict. The LLM extracts claims only.
- Missing coverage for new duties appears in the analysis response's `gaps` array, outside the segment-based patch workflow.
- The regulatory fixture is a simulated provider payload. Its age changes and effective date agree with [MOM retirement guidance](https://www.mom.gov.sg/employment-practices/retirement) and [re-employment guidance](https://www.mom.gov.sg/employment-practices/re-employment). Its purported gazette date and instrument quotations remain unverified. Intake stores provider evidence without authenticating it.

The original fixture requirements remain in [fixtures/README.md](fixtures/README.md). Runtime config/prompt files are under `backend/`; root copies are reference inputs. Use `npm run db:migrate`, which is transactional and never drops application tables.

## Frontend

"Panopticon" is a React + TypeScript + Vite app in `frontend/`, wired to the live API.

```sh
cd frontend
npm install
npm run dev
```

It expects the backend on `http://127.0.0.1:3001/api` (override with `VITE_API_BASE`). The
backend's `CORS_ORIGIN` accepts a comma-separated list and allows both `http://localhost:5173`
and `:5174`, so Vite's port fallback works either way. Serving the app from any other origin
needs that origin adding to `CORS_ORIGIN` in `.env`, followed by a backend restart — otherwise
the browser blocks every response and the UI reports that it cannot reach the API.

Sign in with a seeded username/password (see [Seeded accounts](#seeded-accounts)) — `POST
/api/login` mints a bearer token that's kept in `localStorage`; "Sign out" clears it. A separate
Associate/Senior Partner dropdown in the header only previews what each seniority sees in the UI
copy — it grants nothing. Every real permission (uploading, editing, submitting, approving) is
enforced by the signed-in user's actual backend capability (REVIEWER or APPROVER), independent of
that dropdown.

The main screen is a searchable, filterable list of every document in the system (status: changed
vs. unchanged; type; free text) next to a document viewer showing the full text as continuous
clauses, each flagged clause annotated with its status, the regulator's wording, and — where no
patch was proposed — the specific reason a human has to decide. From there:

- **Summarise changes** — a modal rollup of every flagged clause's verdict and blast radius.
- **View blast radius graph** — a graph of every other document affected by the same regulatory
  changes as the one open.
- **Edit mode** (reviewers only) — opens every clause with a machine-drafted replacement for
  direct in-place typing, and saves + submits everything touched in one action. A clause flagged
  for review with no proposed edit (e.g. a firm-policy finding) shows why but has no box to type
  into — there's currently no path to draft a replacement from scratch when the model declined to.
- Per clause, a reviewer can still **Edit**/**Submit** one at a time instead, and a different
  APPROVER can **Accept**/**Reject** a submitted change — writing a new artefact version and
  advancing the audit trail shown beneath.

The upload modal (the header's "Upload document" button, reviewers only) has two modes:
**Firm document** ingests a DOCX/PDF/JSON artefact (handbook, template, playbook, etc.) for
extraction, same as `POST /api/artefacts`; **Change in law** takes a judgment, amendment, or
circular and reads it the way `POST /api/regulatory-updates/upload` does — no structured form to
fill in. A separate, unlinked `/ingest` route renders the same upload panel standing in for the
firm's own automated horizon-scanning pipeline, reachable only by URL, never from the lawyer-facing
screen.
