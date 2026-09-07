# Frontend API guide

Base URL: `http://127.0.0.1:3001/api`. Browser origin defaults to `http://localhost:5173`; set `CORS_ORIGIN` to your frontend's exact origin before starting the backend. Generate a bearer token using `npm run token -- reviewer` or `npm run token -- approver`.

Use [client/api.js](../client/api.js) from a Vite frontend. Keep `AUTH_SECRET` and `OPENAI_API_KEY` server-side.

## Contract conventions

- IDs are strings (PostgreSQL BIGINT). Numeric database values can be decimal strings. Input regulatory values are JSON numbers; patch `old` and `new` are strings.
- Intake dates use `YYYY-MM-DD`; returned date fields can be ISO timestamps.
- Evidence offsets are JavaScript UTF-16 indices. Use `raw_text.slice(start, end)`; end is exclusive. Never apply original evidence offsets to the current version after approval.
- Machine `system_status` and human `resolution` are separate. Keep both in the UI.
- Every workflow mutation requires the latest integer `revision`. HTTP 409 means refetch. Editing a submitted patch returns it to DRAFT.
- Patch edits change only the new numeric string. Server-owned offsets, old value and version cannot be supplied by the client.
- Errors are `{ "error": "message" }`. 400 invalid input; 401 missing/invalid token; 403 capability/self-approval; 404 missing resource; 409 state conflict; 413 oversized input; 415 unsupported format.

## Routes

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/health` | No token | `{status, extraction_mode}` |
| GET | `/me` | Bearer token | `{id, name, capability}` |
| GET | `/users` | — | Seeded users, no tokens |
| GET | `/artefacts` | — | Artefacts with current version numbers |
| POST | `/artefacts` | Multipart `file`, `type` | Import summary, 201 |
| GET | `/artefacts/:id` | — | Current version, all versions, original segments/rules |
| GET | `/artefacts/:id/download` | — | Current JSON or normalized `.txt` |
| GET | `/artefacts/:id/certificate` | Optional `version` | Plain-text compliance certificate for that version, `.txt` |
| GET | `/regulatory-updates` | — | Update list |
| POST | `/regulatory-updates` | Structured JSON payload | `{id, created}`, 201 or 200 on replay |
| POST | `/regulatory-updates/upload` | Multipart `file` (DOCX/PDF) | Model-proposed update, re-validated; `{id, created}` |
| GET | `/regulatory-updates/:id` | — | Update plus changes |
| POST | `/regulatory-updates/:id/analyse` | No body | `{update_id, created, not_actioned, gaps}` |
| GET | `/impacts` | Optional `update_id`, `status`, `open=true` | Flat finding list |
| GET | `/impacts/:id` | — | Both evidence sources, rule, patch, audit |
| PATCH | `/impacts/:id/patch` | `{revision, new: "64"}` | Updated finding |
| POST | `/impacts/:id/submit` | `{revision}` | Submitted finding |
| POST | `/impacts/:id/approve` | `{revision}` | `{impact, version}`; separate APPROVER only |
| POST | `/impacts/:id/accept` | `{revision}` | Accept an unpatched finding as-is; separate APPROVER only |
| POST | `/impacts/:id/reject` | `{revision, rejection_reason, note?}` | Resolved finding; APPROVER only |
| POST | `/impacts/:id/escalate` | `{revision, note?}` | Escalated finding |

Both seeded roles may read, upload, analyse, edit, submit and escalate. Only an APPROVER may reject/approve. An approver cannot approve their own edit or submission; the backend enforces this even if the UI enables the button.

Upload `type`: `handbook`, `template`, `faq`, `config`, `training`. Limits: one DOCX/PDF/JSON, 5 MB, 250,000 extracted characters and 500 paragraphs/scalar fields. Extraction is synchronous; show an importing state in live mode. Import summaries include `rule_count`, `segment_count`, `extraction_warnings` (number of failed/unmapped segments), and parser `warnings`.

Rejection reasons: `NOT_APPLICABLE`, `WRONG_MATCH`, `POLICY_EXCEEDS`, `NEEDS_COUNSEL`, `OTHER`. Escalation records `NEEDS_COUNSEL`. `note` has a maximum of 5,000 characters.

The certificate lists every finding resolved (`resolution='ACCEPTED'`) against that version — the regulatory change, its evidence tier, who resolved it, and the full `audit_events` trail for that finding — with no data beyond what those tables already record. A version with nothing resolved against it (e.g. the original upload) certifies as verified with no changes.

## Dashboard integration

1. Load `/me`, `/health`, `/artefacts` and `/regulatory-updates`. Display the active account and extraction mode.
2. Upload documents or use the seeded demo. POST the fixture at `fixtures/regulatory/sg-rra-2026.json`, then analyse the returned ID.
3. Show `not_actioned` separately from findings. Show `gaps` as manual coverage-review items; they have no patch or finding ID.
4. Load `/impacts?update_id=...&open=true`. Group by `evidence_tier` or artefact. Without `open=true`, CURRENT and resolved items are also returned.
5. For a detail view, render `evidence_raw_text` with the span from `evidence.start`/`end`. Show `evidence.locator` and `evidence.version_id`. Display `change.source_span`, `regulatory_update.source_url` and effective date alongside it, labelled as supplied regulatory evidence.
6. Render redline controls only for non-null `proposed_patch`. Reviewer optionally edits `new`, then submits the latest revision.
7. Enable approval only when workflow state is SUBMITTED and the active APPROVER differs from both `edited_by` and `submitted_by`.
8. Refetch after decisions. The artefact's `current_version.raw_text` is updated; `analysis_is_stale` explains why extracted rules still belong to the original version. The finding's `audit` lists actors, actions and applied patches.

## Client usage

```js
import { createApi } from './api.js';
const api = createApi({ getToken: () => currentToken });
const { id } = await api.receiveUpdate(payload);
const analysis = await api.analyse(id);
const findings = await api.impacts({ update_id: id, open: true });
const detail = await api.impact(findings[0].id);
const submitted = await api.submit(detail.id, detail.revision);
// Switch currentToken to the separately issued approver token.
await api.approve(submitted.id, submitted.revision);
```

Policy and qualified findings have no patch; offer rejection or escalation instead. An approved finding keeps `system_status: UPDATE_NEEDED` and gets `resolution: ACCEPTED`. Historical segments never create impact_results rows.
