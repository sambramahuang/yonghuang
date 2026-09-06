# Architecture

Diagrams generated from the code in this repository (`backend/src`, `backend/db/schema.sql`,
`frontend/src`). The canonical prose specification is [MVP_ARCHITECTURE.md](../MVP_ARCHITECTURE.md);
design decisions are in [IMPLEMENTATION.md](IMPLEMENTATION.md); the route contract is in
[API.md](API.md).

## 1. System context

```mermaid
graph LR
  Reviewer["Reviewer<br/>(REVIEWER)"]
  Approver["Approver<br/>(APPROVER)"]
  Scanner["Horizon-scanning feed<br/>(/ingest route)"]

  subgraph Panopticon["Panopticon (React + TS + Vite)"]
    UI["Document list, viewer,<br/>blast-radius graph, review panel"]
  end

  subgraph API["Express API :3001/api"]
    Ingest["Ingest + extract"]
    Reg["Regulatory intake"]
    Impact["Impact analysis"]
    Flow["Review workflow"]
    Auth["Login + RBAC"]
  end

  DB[("PostgreSQL")]
  LLM["LLM provider<br/>(structured JSON only)"]

  Reviewer --> UI
  Approver --> UI
  Scanner --> Reg
  UI -- "Bearer token" --> API
  Ingest --> LLM
  Reg --> LLM
  API --> DB
```

The LLM is called only for claim extraction, regulatory-document reading, and unverified drafted
text. Matching, comparison, patching, statuses, versioning and RBAC are deterministic code.

## 2. Ingestion and extraction

```mermaid
flowchart TD
  Upload["POST /api/artefacts<br/>DOCX / PDF / JSON"] --> Parse{Parser}
  Parse -->|.docx| Docx["parsers/docx.js<br/>mammoth to blocks"]
  Parse -->|.pdf| Pdf["parsers/pdf.js<br/>pdfjs-dist to blocks"]
  Parse -->|.json| Json["parsers/json.js<br/>recursive walk to text + locator"]

  Docx --> Seg["segment.js<br/>blocks to segments with char offsets"]
  Pdf --> Seg
  Json --> Seg

  Seg --> Ver["artefact_versions<br/>(immutable, v1 CURRENT)"]
  Seg --> Segs["artefact_segments"]
  Segs --> Ex["extract/rules.js"]

  Ex --> Mode{EXTRACTION_MODE}
  Mode -->|fixture| Fix["Replay committed<br/>model responses"]
  Mode -->|live| Live["Responses API,<br/>strict JSON Schema, store:false"]

  Fix --> Val["extract/schema.js<br/>validate against closed vocabulary"]
  Live --> Val
  Val -->|valid| Rules["internal_rules<br/>concept, value, qualifiers, confidence"]
  Val -->|invalid or LOW confidence| Lex["No rule — lexical leads only"]
```

## 3. Regulatory intake and impact analysis

```mermaid
flowchart TD
  A["POST /api/regulatory-updates<br/>structured JSON"] --> V
  B["POST /api/regulatory-updates/upload<br/>DOCX / PDF of the instrument"] --> RX["regulatory/extract.js<br/>model proposes structured shape"]
  RX --> V["regulatory/schema.js<br/>same validation for both paths"]
  V --> Store["regulatory_updates<br/>+ regulatory_changes"]

  Store --> An["POST /:id/analyse"]
  An --> Eff{"effective_date<br/>in the future?"}
  Eff -->|yes| Defer["Deferred — stored, not analysed"]
  Eff -->|no| M["impact/match.js"]

  M --> S["STRUCTURED tier<br/>rule concept = change concept"]
  M --> L["LEXICAL tier<br/>value appears in text"]

  S --> Bnd["impact/boundary.js<br/>requiresLegalReview()"]
  L --> Bnd
  Bnd --> St{"system_status"}

  St -->|UPDATE_NEEDED| P["impact/patch.js<br/>string replace, VALUE_CHANGED only"]
  St -->|POSSIBLE_IMPACT| NP["Flagged, no patch"]
  St -->|LEGAL_REVIEW_REQUIRED| D["impact/draft.js<br/>unverified drafted text + reason"]
  St -->|CURRENT| None["No action"]

  P --> IR[("impact_results")]
  NP --> IR
  D --> IR
```

`LEXICAL` evidence can never produce `UPDATE_NEEDED` — the database enforces it
(`lexical_never_definitive`). Historical statements and bare numbers produce no finding.

## 4. Review workflow and state machine

```mermaid
stateDiagram-v2
  [*] --> DRAFT: analyse creates finding
  DRAFT --> DRAFT: PATCH /patch (REVIEWER, edits redline)
  DRAFT --> SUBMITTED: POST /submit (REVIEWER)
  SUBMITTED --> RESOLVED: POST /approve (APPROVER, new version)
  SUBMITTED --> RESOLVED: POST /reject (APPROVER, + reason)
  DRAFT --> RESOLVED: POST /accept (APPROVER, no new version)
  DRAFT --> RESOLVED: POST /escalate (REVIEWER, NEEDS_COUNSEL)
  RESOLVED --> [*]
```

Every transition takes the caller's `revision` and writes an `audit_events` row. The approver may
never be the same user as `edited_by` or `submitted_by` — a database `CHECK`, not a UI rule.
Only `/approve` writes a new `artefact_versions` row and marks the previous one `SUPERSEDED`; a
trigger blocks any other mutation of an existing version. `/accept` resolves a finding that needs
no textual change and points at the version already current. Editing a patch resets the finding to
`DRAFT` and clears `submitted_by`, so a re-edit must be re-submitted.

## 5. Approval sequence

```mermaid
sequenceDiagram
  actor R as Reviewer
  actor A as Approver
  participant UI as Panopticon
  participant API as Express API
  participant DB as PostgreSQL

  R->>UI: Edit clause, Submit
  UI->>API: PATCH /impacts/:id/patch {revision, new}
  API->>DB: update proposed_patch, revision++, audit EDIT
  UI->>API: POST /impacts/:id/submit {revision}
  API->>DB: workflow_state = SUBMITTED, audit SUBMIT

  A->>UI: Open the same finding, Accept
  UI->>API: POST /impacts/:id/approve {revision}
  API->>DB: BEGIN
  API->>DB: apply patch to text, insert artefact_versions (v+1 CURRENT)
  API->>DB: mark previous version SUPERSEDED
  API->>DB: resolution = ACCEPTED, resolving_version_id, audit APPROVE
  API->>DB: COMMIT
  API-->>UI: {impact, version}
```

A stale `revision` is rejected, so two concurrent approvals cannot both write a version.

## 6. Data model

```mermaid
erDiagram
  users ||--o{ audit_events : "acts"
  concepts ||--o{ internal_rules : "types"
  concepts ||--o{ regulatory_changes : "types"
  artefacts ||--o{ artefact_versions : "has"
  artefact_versions ||--o{ artefact_segments : "contains"
  artefact_segments ||--o{ internal_rules : "yields"
  artefact_segments ||--o{ impact_results : "is evidence for"
  internal_rules ||--o| impact_results : "supports"
  regulatory_updates ||--o{ regulatory_changes : "contains"
  regulatory_changes ||--o{ impact_results : "triggers"
  impact_results ||--o{ audit_events : "records"
  artefact_versions ||--o| impact_results : "resolves as"
```

`artefact_versions`, `artefact_segments`, `internal_rules` and `audit_events` are append-only; the
`guard_immutable_records` trigger raises on any update other than `CURRENT` to `SUPERSEDED`.
`impact_results` is unique on `(change_id, segment_id)`, which makes re-analysis idempotent.
