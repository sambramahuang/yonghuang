// Mirrors the backend contract in backend/src/queries.js. Field names and
// value sets match the API exactly; nothing here is reshaped or invented.
//
// Note ids arrive as strings: Postgres bigint is serialised as a string by pg
// to avoid precision loss, so never do arithmetic on them.

export type SystemStatus =
  | "CURRENT"
  | "UPDATE_NEEDED"
  | "POSSIBLE_IMPACT"
  | "LEGAL_REVIEW_REQUIRED";

export type EvidenceTier = "STRUCTURED" | "LEXICAL";
export type WorkflowState = "DRAFT" | "SUBMITTED" | "RESOLVED";
export type Resolution = "ACCEPTED" | "REJECTED" | "ESCALATED";

export type RejectionReason =
  | "NOT_APPLICABLE"
  | "WRONG_MATCH"
  | "POLICY_EXCEEDS"
  | "NEEDS_COUNSEL"
  | "OTHER";

export type Capability = "REVIEWER" | "APPROVER";

export interface User {
  id: string;
  name: string;
  capability: Capability;
}

/**
 * A patch replaces a known span. VALUE patches are deterministic - the old text
 * is a number matched literally. TEXT patches are model-drafted prose that no
 * rule can verify, so they carry `verified: false` and must be shown differently.
 */
export interface ProposedPatch {
  start: number;
  end: number;
  old: string;
  new: string;
  base_version_id: number;
  kind?: "VALUE" | "TEXT";
  verified?: boolean;
  drafted_by?: "MODEL" | "HUMAN";
}

export interface ImpactSummary {
  id: string;
  change_id: string;
  segment_id: string;
  rule_id: string | null;
  evidence_tier: EvidenceTier;
  system_status: SystemStatus;
  explanation: string;
  proposed_patch: ProposedPatch | null;
  workflow_state: WorkflowState;
  revision: number;
  resolution: Resolution | null;
  rejection_reason: RejectionReason | null;
  edited_by: string | null;
  submitted_by: string | null;
  approved_by: string | null;
  resolved_by: string | null;
  resolving_version_id: string | null;
  resolved_at: string | null;
  artefact_id: string;
  name: string;
  locator: string;
  segment_text: string;
  concept: string;
  update_id: string;
}

export interface RegulatoryChange {
  id: number;
  concept: string;
  change_type: "VALUE_CHANGED" | "DUTY_ADDED" | "DUTY_REMOVED" | "SCOPE_CHANGED";
  old_value: number | null;
  new_value: number | null;
  unit: string;
  source_span: string;
  update_id: number;
}

export interface RegulatoryUpdate {
  id: number | string;
  provider_ref: string;
  title: string;
  source_url: string;
  gazetted_date: string;
  effective_date: string;
}

export interface Evidence {
  start: number;
  end: number;
  quote: string;
  locator: string;
  version_id: number;
}

export interface AuditEvent {
  id: string;
  impact_id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  detail: unknown;
  created_at: string;
}

export interface InternalRule {
  id: number;
  concept: string | null;
  modality: "IS" | "MUST" | "MUST_NOT" | "MAY";
  operator: "=" | ">=" | "<=" | ">" | "<" | null;
  value: number | null;
  unit: string | null;
  assertion_type: "STATES_LAW" | "STATES_POLICY" | "STATES_BOTH";
  temporal_frame: "PRESENT" | "HISTORICAL" | "FUTURE";
  applies_to_condition: string | null;
  has_qualifier: boolean;
  evidence_start: number;
  evidence_end: number;
  extraction_confidence: "HIGH" | "LOW";
}

export interface ImpactDetail extends Omit<ImpactSummary, "locator" | "segment_text"> {
  change: RegulatoryChange;
  regulatory_update: RegulatoryUpdate;
  segment: { id: number; locator: string; text: string; char_start: number; char_end: number; version_id: number };
  rule: InternalRule | null;
  format: "DOCX" | "JSON";
  current_version_id: string;
  evidence_raw_text: string;
  evidence: Evidence;
  audit: AuditEvent[];
}

export interface Artefact {
  id: string;
  name: string;
  format: "DOCX" | "JSON";
  version: number;
  current_version_id: string;
  analysis_version_id: string;
}

export interface ArtefactVersion {
  id: string;
  artefact_id: string;
  version: number;
  raw_text: string;
  supersedes: string | null;
  status: "CURRENT" | "SUPERSEDED";
  created_by: string | null;
  approved_by: string | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}
