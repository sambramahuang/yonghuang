# Resolved architecture issues

| Original gap or conflict | Implemented decision |
|---|---|
| HISTORICAL meets the review boundary but the fixture demands no finding. | Suppress historical structured matches first; report under `not_actioned`. |
| JSON numbers do not distinguish law from policy. | Hand-declare exact demo filename/path semantics. Unknown fields abstain. |
| Failed extraction has no rule on which to record confidence. | Persist confidence and extraction errors on segments. |
| Submission and audit are described but absent from schema/API. | Add submission/escalation routes, workflow state, revisions and immutable audit records. |
| Plain user IDs can be forged. | Expiring HMAC-signed tokens and database-sourced roles for the local demo. |
| Only checking editor versus approver allows self-submission and approval. | Also require approver and submitter to differ; both constraints exist in PostgreSQL. |
| Independent patches against an original version could overwrite each other. | Lock the artefact and finding, rebase through approved patches, and verify the old text against the current version. Overlap aborts with 409. |
| A reviewer could overwrite a newer patch or approve stale content. | Require the current revision for every mutation. Editing clears submission. |
| The original schema drops all data. | Transactional, advisory-locked, versioned migration; no destructive reset. |
| No current-version FK or uniqueness guarantee. | Add same-artefact foreign keys and one-CURRENT-version index. Keep a separate analysis-version pointer. |
| Comparators, units and unrelated numeric values are insufficiently specified. | Require equality, matching units, a present high-confidence statement of law and exact old-value evidence before patching. Otherwise require review. |
| Re-extraction is excluded, but later updates might consume stale claims. | Existing findings stay idempotent. New changes on an edited artefact require legal review. |
| DUTY_ADDED gaps cannot satisfy a mandatory segment FK. | Return manual gap assessments in the analysis response, outside the patch workflow. |
| The extraction prompt uses a top-level array. | The provider uses a strict `{rules: [...]}` envelope; the service validates the inner array. |
| Model explanations introduce another unverified output. | Use deterministic explanations of the decision. Only extraction invokes the model. |
| Future-effective workflow is excluded. | Store future updates, but refuse analysis before commencement. |

The original schema is archived at `docs/reference/initial-schema.sql`. Runtime schema, vocabulary and prompt files are under `backend/`. The original root vocabulary/prompt copies remain reference inputs.

Mammoth normalizes DOCX to text and the specified source of truth is `raw_text`. Versions and downloads therefore preserve content, not Word formatting or tracked changes. JSON downloads remain valid JSON. A formatting-preserving Word export needs source binary storage and an OOXML patch design.

This is the agreed local demo backend. Organisation SSO, provider provenance verification, isolated processing for hostile uploads, background extraction jobs, large-dataset pagination and production operations are not included. Live extraction quality is not established by tests that replay recorded responses.
