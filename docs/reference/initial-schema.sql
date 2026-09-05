-- MVP schema. One-day scope. See docs/MVP_ARCHITECTURE.md §12 for what is deliberately absent.
-- Run once: psql "$DATABASE_URL" -f backend/db/schema.sql

DROP TABLE IF EXISTS impact_results, internal_rules, artefact_segments,
  artefact_versions, artefacts, regulatory_changes, regulatory_updates, users CASCADE;

-- Two seeded users. No signup, no passwords for the MVP; the token carries the user id.
CREATE TABLE users (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  capability TEXT NOT NULL CHECK (capability IN ('REVIEWER', 'APPROVER'))
);

CREATE TABLE artefacts (
  id                 BIGSERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  type               TEXT NOT NULL,          -- handbook | template | faq | config
  current_version_id BIGINT                  -- FK assigned after the first version insert
);

-- Append-only. An approval never overwrites; it inserts version+1 and supersedes the old row.
CREATE TABLE artefact_versions (
  id          BIGSERIAL PRIMARY KEY,
  artefact_id BIGINT NOT NULL REFERENCES artefacts(id) ON DELETE CASCADE,
  version     INT    NOT NULL,
  raw_text    TEXT   NOT NULL,               -- source of truth; all offsets index into this
  supersedes  BIGINT REFERENCES artefact_versions(id),
  status      TEXT   NOT NULL CHECK (status IN ('CURRENT', 'SUPERSEDED')),
  created_by  BIGINT REFERENCES users(id),
  approved_by BIGINT REFERENCES users(id),   -- NULL only for the initial import
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (artefact_id, version)
);

CREATE TABLE artefact_segments (
  id         BIGSERIAL PRIMARY KEY,
  version_id BIGINT NOT NULL REFERENCES artefact_versions(id) ON DELETE CASCADE,
  ordinal    INT  NOT NULL,                  -- render order
  locator    TEXT NOT NULL,                  -- 'p.12' | 'Heading > para 3' | '$.hr.retirementAge'
  char_start INT  NOT NULL,                  -- offsets into artefact_versions.raw_text
  char_end   INT  NOT NULL,
  text       TEXT NOT NULL                   -- denormalised for search; offsets are authoritative
);

CREATE TABLE internal_rules (
  id                    BIGSERIAL PRIMARY KEY,
  segment_id            BIGINT NOT NULL REFERENCES artefact_segments(id) ON DELETE CASCADE,
  concept               TEXT,                -- id from concepts.json; NULL == UNMAPPED
  modality              TEXT NOT NULL CHECK (modality IN ('IS','MUST','MUST_NOT','MAY')),
  operator              TEXT,
  value                 NUMERIC,
  unit                  TEXT,
  assertion_type        TEXT NOT NULL CHECK (assertion_type IN ('STATES_LAW','STATES_POLICY','STATES_BOTH')),
  temporal_frame        TEXT NOT NULL CHECK (temporal_frame IN ('PRESENT','HISTORICAL','FUTURE')),
  applies_to_condition  TEXT,                -- stored and displayed; never machine-reasoned
  has_qualifier         BOOLEAN NOT NULL DEFAULT false,
  evidence_start        INT NOT NULL,
  evidence_end          INT NOT NULL,
  extraction_confidence TEXT NOT NULL CHECK (extraction_confidence IN ('HIGH','LOW'))
);
CREATE INDEX idx_rules_concept ON internal_rules(concept);

CREATE TABLE regulatory_updates (
  id             BIGSERIAL PRIMARY KEY,
  provider_ref   TEXT UNIQUE,                -- idempotency for the simulated webhook
  title          TEXT NOT NULL,
  source_url     TEXT,
  gazetted_date  DATE,
  effective_date DATE NOT NULL
);

CREATE TABLE regulatory_changes (
  id          BIGSERIAL PRIMARY KEY,
  update_id   BIGINT NOT NULL REFERENCES regulatory_updates(id) ON DELETE CASCADE,
  concept     TEXT NOT NULL,
  change_type TEXT NOT NULL,                 -- v1 auto-handles VALUE_CHANGED only
  old_value   NUMERIC,
  new_value   NUMERIC,
  unit        TEXT,
  source_span TEXT NOT NULL                  -- quoted text from the instrument, for evidence
);

CREATE TABLE impact_results (
  id               BIGSERIAL PRIMARY KEY,
  change_id        BIGINT NOT NULL REFERENCES regulatory_changes(id) ON DELETE CASCADE,
  segment_id       BIGINT NOT NULL REFERENCES artefact_segments(id) ON DELETE CASCADE,
  rule_id          BIGINT REFERENCES internal_rules(id),   -- NULL for LEXICAL hits
  evidence_tier    TEXT NOT NULL CHECK (evidence_tier IN ('STRUCTURED','LEXICAL')),
  system_status    TEXT NOT NULL CHECK (system_status IN
                     ('CURRENT','UPDATE_NEEDED','POSSIBLE_IMPACT','LEGAL_REVIEW_REQUIRED')),
  explanation      TEXT NOT NULL,
  proposed_patch   JSONB,                    -- {"old":"63","new":"64"} or NULL

  -- human decision; separate from the machine verdict above
  resolution       TEXT CHECK (resolution IN ('ACCEPTED','REJECTED','ESCALATED')),
  rejection_reason TEXT CHECK (rejection_reason IN
                     ('NOT_APPLICABLE','WRONG_MATCH','POLICY_EXCEEDS','NEEDS_COUNSEL','OTHER')),
  edited_by        BIGINT REFERENCES users(id),
  approved_by      BIGINT REFERENCES users(id),
  resolving_version_id BIGINT REFERENCES artefact_versions(id),
  resolved_at      TIMESTAMPTZ,

  -- re-running analyse must never create duplicates
  UNIQUE (change_id, segment_id),

  -- a lexical (keyword) hit is a lead, never a finding: it can neither be definitive nor patched
  CONSTRAINT lexical_never_definitive
    CHECK (NOT (evidence_tier = 'LEXICAL' AND system_status = 'UPDATE_NEEDED')),
  CONSTRAINT lexical_never_patched
    CHECK (NOT (evidence_tier = 'LEXICAL' AND proposed_patch IS NOT NULL)),

  -- separation of duties: an approver may not approve their own edit
  CONSTRAINT approver_is_not_proposer
    CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM edited_by)
);

INSERT INTO users (name, capability) VALUES
  ('Rachel Tan (Knowledge Lawyer)', 'REVIEWER'),
  ('Daniel Lim (Partner)',          'APPROVER');
