# MVP Architecture — Canonical Specification

> **This document is the canonical MVP specification.**
> If any other document in this repo (including `CLAUDE_ARCH_REVIEW.md` or `RESEARCH.md`)
> conflicts with this file, **follow this file**.
>
> Scope: **one-day hackathon build.** SMU LIT Legal-Tech Hackathon 2026 — R&T Challenge 3B,
> "Designing a Sustainable and Resilient LegalTech".

---

## 1. What we are building, in one sentence

A firm's internal documents quietly assume what the law says. We extract those assumptions as
structured claims, and when a regulatory update arrives we identify exactly which claims have
become stale, show the evidence on both sides, propose a redline, and require a human to approve it.

## 2. Problem boundary

Horizon scanning is **out of scope by design**. The challenge statement notes firms already have
alert platforms. Our system starts *after* a change has been detected:

```
[external horizon-scanning provider]
        ↓  structured regulatory update (JSON)
   OUR SYSTEM
        ↓  identify affected internal artefacts
        ↓  explain the impact
        ↓  propose the update
        ↓
   [authorised human approves / rejects]
```

For the demo, the provider is simulated by POSTing a JSON payload. That is a realistic
integration shape, not a shortcut we need to apologise for.

## 3. Core flow (build this vertical slice first)

```
1. Ingest internal artefacts .............. DOCX + JSON only
2. Extract structured legal claims ........ LLM, constrained to fixed concept vocabulary
3. Receive structured regulatory update ... POST /api/regulatory-updates
4. Deterministically find stale claims .... SQL concept match + literal/alias match
5. Show exact evidence .................... paragraph locator or JSON path, char offsets
6. Propose a simple redline ............... string replace, VALUE_CHANGED only
7. REVIEWER reviews ....................... inspect evidence, edit patch, submit
8. APPROVER approves / rejects ............ writes new artefact version + audit row
```

**Nothing is ever published automatically. There is no code path from the extraction service
to `artefact_versions`.** That constraint is a feature; state it in the pitch.

## 4. Priority order (do not reorder)

1. Structured end-to-end flow works
2. RBAC approval works
3. Evidence highlighting works
4. One adversarial false-positive case works (the HISTORICAL case — see §10)
5. Only then, anything from §12 (stretch)

If we run out of time, a working slice on **one** concept beats a broken system on four.

---

## 5. Supported concepts (closed vocabulary)

The concept vocabulary lives in the `concepts` table, seeded from `backend/config/concepts.json`.
The LLM classifies into this enum during extraction; it never invents a concept mid-extraction.
Anything it cannot place becomes `UNMAPPED`, which is a valid, expected output.

The table below is the employment-law seed. A document from an unseen practice area would once
have produced nothing until someone hand-edited the config, which is not a task a lawyer can
perform. Concepts are therefore **discovered** from a document's own text before it is extracted
(`backend/src/extract/discover.js`): the model proposes quantitative parameters, each candidate is
normalised and de-duplicated against the existing vocabulary, and survivors are written to the
table. Extraction remains a closed-enum classification against whatever the vocabulary holds at
that moment.

| id | value type | unit | direction |
|---|---|---|---|
| `retirement_age` | number | years | FLOOR |
| `reemployment_age` | number | years | FLOOR |
| `cpf_ow_ceiling` | money | SGD/month | CEILING |
| `shared_parental_leave_weeks` | duration | weeks | FLOOR |
| `paternity_leave_weeks` | duration | weeks | FLOOR |
| `UNMAPPED` | — | — | — |

Why this matters: it converts an open-vocabulary matching problem into a **classification problem
with an explicit abstention bucket**. That is testable and defensible under questioning.

## 6. Internal rule schema

Extracted per segment. Every field earns its place:

```jsonc
{
  "concept": "retirement_age",       // FK to concepts.json, or null == UNMAPPED
  "modality": "IS",                  // IS | MUST | MUST_NOT | MAY
  "operator": "=",                   // = | >= | <= | > | <   (required for IS, null for MAY,
                                     //   optional for MUST / MUST_NOT)
  "value": 63,
  "unit": "years",
  "assertion_type": "STATES_LAW",    // STATES_LAW | STATES_POLICY | STATES_BOTH
  "temporal_frame": "PRESENT",       // PRESENT | HISTORICAL | FUTURE
  "applies_to_condition": null,      // stored and displayed; NEVER machine-reasoned
  "has_qualifier": false,            // set by regex: unless|except|provided that|subject to
  "evidence_start": 42,              // char offsets into artefact_versions.raw_text
  "evidence_end": 76,
  "extraction_confidence": "HIGH"    // HIGH | LOW  (two values, never a float)
}
```

`assertion_type` and `temporal_frame` are the two fields that kill our worst false positives:

```
"The statutory retirement age is 63."             STATES_LAW  / PRESENT     → update
"We do not retire staff before 65."               STATES_POLICY / PRESENT   → do not touch
"Before 1 July 2026 the retirement age was 63."   STATES_LAW  / HISTORICAL  → do not touch
```

## 7. Matching (deterministic only for the MVP)

Two evidence tiers, run as **one SQL query**. No semantic tier in v1. No embeddings, no vector DB.

- **STRUCTURED** — `internal_rules.concept = change.concept`. High confidence. Can produce
  `UPDATE_NEEDED` and a patch.
- **LEXICAL** — segment text contains a concept alias *and* the literal old value, where no
  structured rule already covers that segment. Produces `POSSIBLE_IMPACT` only. **Never patched.**

The alias-plus-value co-occurrence requirement is what stops "clause 63" and "Form 63" from
matching a retirement-age change. Do not relax it.

## 8. Statuses

Machine verdict and human decision are separate columns. Do not merge them.

**`system_status`** (set by the engine, never by a human):

| status | meaning |
|---|---|
| `CURRENT` | rule already matches the new position |
| `UPDATE_NEEDED` | structured match, states law, present tense, no qualifier → patch offered |
| `POSSIBLE_IMPACT` | lexical match, or a gap (no artefact addresses a new duty) → no patch |
| `LEGAL_REVIEW_REQUIRED` | competence boundary hit → no patch, escalate |

**`resolution`** (set by a human, nullable): `ACCEPTED` | `REJECTED` | `ESCALATED`.

`EXCEEDS_REQUIREMENT` is a **resolution**, not a system status — only a human can confirm the firm
exceeds the law deliberately. For the one-day build it is recorded as `REJECTED` with
`rejection_reason = 'POLICY_EXCEEDS'`. The full exemptions lifecycle is stretch (§12).

## 9. Competence boundary

Hard-code this. It is a function, not a prompt instruction, and it runs **before** any patch is drafted.

```js
// backend/src/impact/boundary.js
// The system's declared limit. If any of these hold, we refuse to propose a change.
function requiresLegalReview(rule, change) {
  return (
    change.change_type !== 'VALUE_CHANGED' ||        // v1 only auto-handles value changes
    rule.has_qualifier ||                            // unless / except / provided that
    rule.assertion_type === 'STATES_BOTH' ||         // law and policy entangled in one sentence
    rule.temporal_frame !== 'PRESENT' ||             // historical or future statements
    rule.extraction_confidence === 'LOW' ||
    rule.applies_to_condition != null ||             // a stated condition we did not parse
    !['IS','MUST','MUST_NOT'].includes(rule.modality) ||  // MAY grants, it does not set
    !['=','<=','>='].includes(rule.operator)         // a threshold we can compare
  );
}
```

Being able to point at this function on stage and say *"this is where our system stops"* is the
strongest single thing we can show on the Innovation criterion. Put it on a slide.

## 10. Must-pass adversarial cases

Write these fixtures **before** building the UI. At minimum, cases 1–4 must pass for the demo.

| # | Case | Fixture must contain | Expected |
|---|---|---|---|
| 1 | Historical statement | "Before 1 July 2026, the statutory retirement age was 63." | no finding; listed under "not actioned — HISTORICAL" |
| 2 | Same number, unrelated | "Refer to clause 63 of the Staff Manual." | no finding at all |
| 3 | Deliberate over-compliance | "Our policy is to offer re-employment until age 70." | `POSSIBLE_IMPACT`, no patch; human rejects as `POLICY_EXCEEDS` |
| 4 | Conditional / exception | "...at 63, unless the employee is medically unfit." | `LEGAL_REVIEW_REQUIRED`, no patch |
| 5 | JSON config field | `{"retirementAge": 63}` | `UPDATE_NEEDED`, patch, locator `$.hr.retirementAge` |
| 6 | Already remediated | handbook at 64, offer letter at 63 | exactly one open finding |

Case 5 is our differentiator — a config file lighting up beside a handbook is the moment the
judges understand this is not a document-diff tool. Make sure it works.

## 11. Roles

Two capabilities for the MVP. Seed two users; no signup flow, no password reset.

| capability | can |
|---|---|
| `REVIEWER` | view findings, inspect evidence, edit the proposed patch, submit for approval |
| `APPROVER` | everything above, plus approve / reject, which writes a new artefact version |

Enforced by Express middleware on the route, not in the UI. An APPROVER holds every REVIEWER
permission and may edit, submit and approve the same finding: the authority to sign off sits with
the partner, and the audit trail records each action against its actor either way. Approval itself
remains an APPROVER capability, so a reviewer cannot approve their own work.

## 12. Explicitly out of scope

Do not build these. If someone joins mid-day and starts on one, stop them.

- live horizon scanning / web scraping
- semantic (Tier 3) retrieval, embeddings, vector database, pgvector
- old/new regulatory **text** normaliser (we accept structured JSON only)
- exemptions lifecycle / sticky over-compliance memory
- selective segment re-extraction after approval
- arbitrary case-law reasoning
- multi-jurisdiction
- automatic publishing
- Neo4j or any graph database
- dependency-graph visualisation
- PDF, PPTX, XLSX ingestion
- model fine-tuning
- generic legal chatbot
- email / notifications
- `PENDING_COMMENCEMENT` status and the future-effective workflow

**Stretch, only if the core flow is finished and tested:** exemptions table, semantic tier,
`PENDING_COMMENCEMENT`, text normaliser. In that order.

## 13. Known limitations (say these out loud in Q&A)

Owning these is stronger than being caught by them.

1. **No re-extraction after approval.** A finding is closed by its resolution, not by re-analysing
   the new version. Re-running analysis on an approved artefact could theoretically re-flag it;
   we prevent this with a `UNIQUE (change_id, segment_id)` idempotency key rather than by
   recomputing. Correct fix is selective re-extraction — out of scope today.
2. **Extraction accuracy is unmeasured at scale.** We test on a fixed fixture set, not a held-out
   corpus. Published work on tracing prose artefacts to legal provisions reports precision around
   30% for LLM-only approaches, which is exactly why our patch path is deterministic and the LLM
   never decides impact.
3. **We do not parse conditions.** `applies_to_condition` is stored and shown, never reasoned over.
   Any rule with one goes to `LEGAL_REVIEW_REQUIRED`.
4. **Renumbering.** We diff at parameter level, so a renumbered-but-unchanged provision produces
   no change record — by construction, not by detection.

## 14. Stack

```
frontend   React (Vite)          — one dashboard, one detail view. No component library needed.
backend    Node + Express
database   PostgreSQL
AI         LLM API, structured JSON output only (extraction + explanation text)
parsing    mammoth (DOCX) · native JSON walk
```

## 15. Module layout

```
backend/
├── config/concepts.json           # closed concept vocabulary (seeded, hand-written)
├── prompts/extract-internal-rule.md
├── db/schema.sql
└── src/
    ├── ingest/
    │   ├── parsers/docx.js        # mammoth → blocks
    │   ├── parsers/json.js        # recursive walk → { text, locator }
    │   └── segment.js             # blocks → segments with char offsets
    ├── extract/rules.js           # segment → internal_rules (LLM, enum-constrained)
    ├── regulatory/intake.js       # validate + store structured update
    ├── impact/
    │   ├── match.js               # the one SQL query (STRUCTURED + LEXICAL)
    │   ├── boundary.js            # requiresLegalReview()
    │   └── patch.js               # string replace; VALUE_CHANGED only
    ├── workflow/review.js         # edit patch, approve, reject, new version
    └── auth/rbac.js               # capability middleware
```

## 16. API surface

```
POST   /api/artefacts                        upload DOCX/JSON → ingest + extract   [any]
GET    /api/artefacts/:id                    raw_text + segments + rules           [any]

POST   /api/regulatory-updates               structured payload (simulated webhook)[any]
POST   /api/regulatory-updates/:id/analyse   create impact_results                 [any]

GET    /api/impacts?update_id=&status=       review queue, grouped by tier         [any]
GET    /api/impacts/:id                      both evidence spans + proposed patch  [any]
PATCH  /api/impacts/:id/patch                edit the redline                      [REVIEWER]
POST   /api/impacts/:id/approve              → new artefact version + audit        [APPROVER]
POST   /api/impacts/:id/reject               { rejection_reason }                  [APPROVER]
```

## 17. Responsibility split

**LLM does:** segment → rule extraction (constrained JSON); the natural-language `explanation`
string shown to the user.

**Deterministic code does:** concept matching, value comparison, the competence boundary, patch
construction (string replace — never generation), status assignment, idempotency, versioning, RBAC.

**Humans do:** approve, reject, escalate, edit patches.

## 18. Build order and ownership

Branches map to the module layout so people don't collide.

| branch | owner | delivers | done when |
|---|---|---|---|
| `db-schema` | — | `schema.sql` + seed users + `concepts.json` | migrations run clean; merge first |
| `backend-ingestion` | — | DOCX + JSON parse → segments → rules | `POST /api/artefacts` returns rules for a fixture |
| `backend-impact-engine` | — | intake, match, boundary, patch | `analyse` produces correct findings for cases 1–4 |
| `auth-rbac` | — | middleware + 2 seeded users | approve rejected for a REVIEWER token |
| `frontend-dashboard` | — | queue + detail + approve/reject | full click-through against seeded data |

`db-schema` merges to `main` first; everything else branches off it. Frontend works against
seeded rows from hour one so it never blocks on the backend.

## 19. Three integration tests that matter

```js
// 1. The demo path is reproducible.
test('retirement_age 63→64 flags exactly the expected artefacts and patches only those', ...)

// 2. The boundary holds regardless of what the LLM says.
test('historical, conditional and policy rules never receive a proposed_patch', ...)

// 3. No duplicate findings.
test('re-running analyse creates zero new impact_results', ...)
```

Test 2 is the one to run live if a judge asks whether the AI can go rogue.

## 20. Demo sequence (4 minutes)

1. **0:00** Regulatory update lands as a webhook payload — retirement age 63 → 64, gazetted
   1 April 2026, effective 1 July 2026.
2. **0:30** Analyse. Handbook, offer-letter template and HR JSON config light up with exact
   highlighted evidence on both sides.
3. **1:30** The **not-actioned** list — historical sentence suppressed, "clause 63" never matched,
   the retire-at-70 policy flagged but not patched, the conditional clause refused with
   `LEGAL_REVIEW_REQUIRED`.
4. **2:30** Reviewer edits a patch → approver approves → new version + audit trail. Re-run: zero
   new findings.
5. **3:30** Hand a judge the keyboard: edit a number in a fixture, re-run, watch it appear.
   Close on `boundary.js` on screen — "this is where our system refuses."

---

*Reference material: `CLAUDE_ARCH_REVIEW.md` (full design review — reference only, not a build
checklist) · `RESEARCH.md` (prior art).*
