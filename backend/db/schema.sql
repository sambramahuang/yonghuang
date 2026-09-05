-- Initial, non-destructive migration. Run via npm run db:migrate.
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  capability TEXT NOT NULL CHECK (capability IN ('REVIEWER','APPROVER'))
);
CREATE TABLE concepts (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, unit TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('FLOOR','CEILING')),
  aliases TEXT[] NOT NULL
);
CREATE TABLE artefacts (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('DOCX','PDF','JSON')),
  current_version_id BIGINT, analysis_version_id BIGINT
);
CREATE TABLE artefact_versions (
  id BIGSERIAL PRIMARY KEY,
  artefact_id BIGINT NOT NULL REFERENCES artefacts(id),
  version INT NOT NULL CHECK (version > 0), raw_text TEXT NOT NULL,
  supersedes BIGINT REFERENCES artefact_versions(id),
  status TEXT NOT NULL CHECK (status IN ('CURRENT','SUPERSEDED')),
  created_by BIGINT NOT NULL REFERENCES users(id),
  approved_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (artefact_id, version), UNIQUE (artefact_id, id),
  CHECK ((version = 1 AND supersedes IS NULL AND approved_by IS NULL) OR
    (version > 1 AND supersedes IS NOT NULL AND approved_by IS NOT NULL)),
  FOREIGN KEY (artefact_id, supersedes) REFERENCES artefact_versions(artefact_id, id)
);
CREATE UNIQUE INDEX one_current_version ON artefact_versions(artefact_id) WHERE status = 'CURRENT';
ALTER TABLE artefacts ADD FOREIGN KEY (id, current_version_id) REFERENCES artefact_versions(artefact_id, id);
ALTER TABLE artefacts ADD FOREIGN KEY (id, analysis_version_id) REFERENCES artefact_versions(artefact_id, id);
CREATE TABLE artefact_segments (
  id BIGSERIAL PRIMARY KEY, version_id BIGINT NOT NULL REFERENCES artefact_versions(id),
  ordinal INT NOT NULL, locator TEXT NOT NULL, char_start INT NOT NULL,
  char_end INT NOT NULL, text TEXT NOT NULL,
  value_start INT, value_end INT,
  extraction_confidence TEXT NOT NULL CHECK (extraction_confidence IN ('HIGH','LOW')),
  extraction_error TEXT,
  UNIQUE (version_id, ordinal), CHECK (char_start >= 0 AND char_end > char_start)
);
CREATE TABLE internal_rules (
  id BIGSERIAL PRIMARY KEY, segment_id BIGINT NOT NULL REFERENCES artefact_segments(id),
  concept TEXT REFERENCES concepts(id),
  modality TEXT NOT NULL CHECK (modality IN ('IS','MUST','MUST_NOT','MAY')),
  operator TEXT CHECK (operator IN ('=','>=','<=','>','<')),
  value NUMERIC, unit TEXT,
  assertion_type TEXT NOT NULL CHECK (assertion_type IN ('STATES_LAW','STATES_POLICY','STATES_BOTH')),
  temporal_frame TEXT NOT NULL CHECK (temporal_frame IN ('PRESENT','HISTORICAL','FUTURE')),
  applies_to_condition TEXT, has_qualifier BOOLEAN NOT NULL,
  evidence_start INT NOT NULL, evidence_end INT NOT NULL,
  extraction_confidence TEXT NOT NULL CHECK (extraction_confidence IN ('HIGH','LOW')),
  CHECK (evidence_start >= 0 AND evidence_end > evidence_start),
  -- A statement of fact must carry a comparator ("is 63"). A duty may carry
  -- one ("within 30 days") but need not. MAY asserts no threshold at all.
  CHECK ((modality = 'IS' AND operator IS NOT NULL) OR (modality = 'MAY' AND operator IS NULL)
    OR modality IN ('MUST','MUST_NOT'))
);
CREATE INDEX idx_rules_concept ON internal_rules(concept);
CREATE TABLE regulatory_updates (
  id BIGSERIAL PRIMARY KEY, provider_ref TEXT UNIQUE NOT NULL,
  payload_hash TEXT NOT NULL, title TEXT NOT NULL, source_url TEXT,
  gazetted_date DATE, effective_date DATE NOT NULL
);
CREATE TABLE regulatory_changes (
  id BIGSERIAL PRIMARY KEY, update_id BIGINT NOT NULL REFERENCES regulatory_updates(id),
  concept TEXT NOT NULL REFERENCES concepts(id), change_type TEXT NOT NULL,
  old_value NUMERIC, new_value NUMERIC, unit TEXT NOT NULL, source_span TEXT NOT NULL,
  UNIQUE (update_id, concept)
);
CREATE TABLE impact_results (
  id BIGSERIAL PRIMARY KEY, change_id BIGINT NOT NULL REFERENCES regulatory_changes(id),
  segment_id BIGINT NOT NULL REFERENCES artefact_segments(id),
  rule_id BIGINT REFERENCES internal_rules(id),
  evidence_tier TEXT NOT NULL CHECK (evidence_tier IN ('STRUCTURED','LEXICAL')),
  system_status TEXT NOT NULL CHECK (system_status IN ('CURRENT','UPDATE_NEEDED','POSSIBLE_IMPACT','LEGAL_REVIEW_REQUIRED')),
  explanation TEXT NOT NULL, proposed_patch JSONB,
  workflow_state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (workflow_state IN ('DRAFT','SUBMITTED','RESOLVED')),
  revision INT NOT NULL DEFAULT 1,
  resolution TEXT CHECK (resolution IN ('ACCEPTED','REJECTED','ESCALATED')),
  rejection_reason TEXT CHECK (rejection_reason IN ('NOT_APPLICABLE','WRONG_MATCH','POLICY_EXCEEDS','NEEDS_COUNSEL','OTHER')),
  edited_by BIGINT REFERENCES users(id), submitted_by BIGINT REFERENCES users(id),
  approved_by BIGINT REFERENCES users(id), resolved_by BIGINT REFERENCES users(id),
  resolving_version_id BIGINT REFERENCES artefact_versions(id), resolved_at TIMESTAMPTZ,
  UNIQUE (change_id, segment_id),
  CONSTRAINT lexical_never_definitive CHECK (NOT (evidence_tier='LEXICAL' AND system_status='UPDATE_NEEDED')),
  CONSTRAINT only_updates_patched CHECK (proposed_patch IS NULL
    OR (proposed_patch->>'kind' = 'VALUE' AND evidence_tier='STRUCTURED' AND system_status='UPDATE_NEEDED')
    OR (proposed_patch->>'kind' = 'TEXT' AND system_status IN ('UPDATE_NEEDED','LEGAL_REVIEW_REQUIRED'))),
  CONSTRAINT text_patch_unverified CHECK (proposed_patch IS NULL OR proposed_patch->>'kind' <> 'TEXT'
    OR (proposed_patch->>'verified')::boolean IS FALSE),
  CONSTRAINT approver_is_not_proposer CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM edited_by),
  CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM submitted_by),
  CHECK ((workflow_state='RESOLVED') = (resolution IS NOT NULL)),
  CHECK (resolution IS DISTINCT FROM 'ACCEPTED' OR (approved_by IS NOT NULL AND resolving_version_id IS NOT NULL))
);
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY, impact_id BIGINT NOT NULL REFERENCES impact_results(id),
  actor_id BIGINT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
  details JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION guard_immutable_records() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'artefact_versions' AND TG_OP = 'UPDATE' THEN
    IF OLD.status = 'CURRENT' AND NEW.status = 'SUPERSEDED'
       AND (to_jsonb(OLD) - 'status') = (to_jsonb(NEW) - 'status') THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Record is immutable';
END $$;
CREATE TRIGGER immutable_versions BEFORE UPDATE OR DELETE ON artefact_versions
  FOR EACH ROW EXECUTE FUNCTION guard_immutable_records();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION guard_immutable_records();
INSERT INTO users(name,capability) VALUES
 ('Rachel Tan (Knowledge Lawyer)','REVIEWER'), ('Daniel Lim (Partner)','APPROVER');
