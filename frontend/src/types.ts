// Domain model mirrors the shape the eventual graph backend will expose:
// documents and clauses are nodes, ChangeEvent.blastRadius are edges to
// other affected document nodes. The frontend already treats "which
// documents does this change touch" as a graph query result, so swapping
// mockApi for a real graph API later is a data-layer change only.

export type LegalStatus =
  | "good_law"
  | "overturned"
  | "in_progress"
  | "seminal_pending";

export type ChangeType =
  | "amendment"
  | "judicial_reinterpretation"
  | "regulatory_guidance"
  | "overturned"
  | "pending_appeal";

export type DocumentType =
  | "Act"
  | "Subsidiary Legislation"
  | "Case"
  | "Guideline"
  | "Circular"
  | "Practice Direction"
  | "Internal Playbook"
  | "Template Clause"
  | "Client Advisory";

export interface AffectedDocRef {
  documentId: string;
  title: string;
  citation: string;
  relationship: string; // e.g. "cites this provision", "template clause derived from"
}

export interface ChangeEvent {
  id: string;
  type: ChangeType;
  date: string; // ISO date
  source: string; // e.g. "Court of Appeal in Lee v Tan [2026] SGCA 4"
  summary: string; // one-line "what changed"
  detail: string; // longer explanation
  blastRadius: AffectedDocRef[];
}

export interface Clause {
  id: string;
  documentId: string;
  heading: string;
  text: string;
  status: LegalStatus;
  changeEvent?: ChangeEvent;
}

export interface LegalDocument {
  id: string;
  title: string;
  citation: string;
  type: DocumentType;
  practiceAreas: string[];
  // No stored `status` field on purpose: overall status is always derived
  // (see getEffectiveStatus) from this document's own clauses plus any
  // incoming impacts from changes ingested elsewhere in the graph, so it
  // can never drift out of sync with an upload the lawyer just made.
  lastUpdated: string; // ISO date
  summary: string;
  clauses: Clause[];
}

export const STATUS_ORDER: Record<LegalStatus, number> = {
  overturned: 3,
  seminal_pending: 2,
  in_progress: 1,
  good_law: 0,
};

export type SortKey = "relevance" | "lastUpdated" | "blastRadius" | "severity";
