// Domain model for the firm's own tools, systems, and practices — not the
// underlying law itself. Each clause that needs a change cites an Authority
// (a statute or case) as a plain string; blast radius is computed by
// finding every other document with a clause citing that same authority
// (see lib/legalGraph.ts), so propagation never needs to be hand-wired
// between documents — it falls out of the citation graph.

export type ChangeStatus = "no_change" | "change" | "uncertain";

export type FirmDocType = "Tool" | "System" | "Practice" | "Contract";

export type AuthorityType = "statute" | "case" | "guidance";

// One fragment of a clause's Word-track-changes-style redline: plain text
// carried through unchanged, text being struck out, or text being inserted.
export interface TextSegment {
  text: string;
  kind: "same" | "deleted" | "inserted";
}

export interface SuggestedChange {
  id: string;
  authority: string; // e.g. "Goh v Straits Manufacturing Pte Ltd [2026] SGCA 7"
  authorityType: AuthorityType;
  date: string; // ISO date
  summary: string; // one-line "what changed"
  detail: string; // longer explanation
  redline?: TextSegment[]; // present once the exact edit is known (status "change")
  approved: boolean; // has a reviewing lawyer signed off on this suggested edit
}

export interface Clause {
  id: string;
  documentId: string;
  heading: string;
  text: string; // base text, used whenever there is no redline to render
  status: ChangeStatus;
  change?: SuggestedChange;
}

export interface FirmDocument {
  id: string;
  title: string;
  citation: string; // internal reference, e.g. "Internal playbook, v6"
  type: FirmDocType;
  client: string; // "Firm-wide" or a named client
  practiceAreas: string[];
  lastUpdated: string; // ISO date
  summary: string;
  clauses: Clause[];
}

export const STATUS_ORDER: Record<ChangeStatus, number> = {
  change: 2,
  uncertain: 1,
  no_change: 0,
};

export type SortKey = "relevance" | "lastUpdated" | "blastRadius" | "severity";
