// Domain model for the firm's own tools, systems, and practices — not the
// underlying law itself. Each clause that needs a change cites an Authority
// (a statute or case) as a plain string; blast radius is computed by
// finding every other document with a clause citing that same authority
// (see lib/legalGraph.ts), so propagation never needs to be hand-wired
// between documents — it falls out of the citation graph.

// Two states, deliberately. A finding either needs a human to act on it or it
// does not; whether the proposed edit is a verified value swap or model-drafted
// wording is a property of the patch, shown in the clause, not a third status.
export type ChangeStatus = "no_change" | "change";

export type FirmDocType =
  | "Contract"
  | "Checklist"
  | "Workflow"
  | "Playbook"
  | "Template Clause"
  | "Client Advisory"
  | "Training Material"
  | "Automated Compliance Tool";

export type AuthorityType = "statute" | "case" | "guidance";

// One fragment of a clause's Word-track-changes-style redline: plain text
// carried through unchanged, text being struck out, or text being inserted.
export interface TextSegment {
  text: string;
  kind: "same" | "deleted" | "inserted";
}

// How a reviewer closed a suggested change. Once set, the clause is settled:
// its status drops to "no_change" and the redline is resolved away — accepting
// deletes the original text and keeps the new wording, rejecting drops the
// proposal and keeps the original.
export type ChangeResolution = "accepted" | "rejected" | "escalated";

export interface SuggestedChange {
  id: string;
  authority: string; // e.g. "Goh v Straits Manufacturing Pte Ltd [2026] SGCA 7"
  authorityType: AuthorityType;
  date: string; // ISO date
  summary: string; // one-line "what changed"
  detail: string; // longer explanation
  redline?: TextSegment[]; // present once the exact edit is known (status "change")
  approved: boolean; // has a reviewing lawyer signed off on this suggested edit
  resolution?: ChangeResolution | null; // null while the change is still open
  // An exact edit exists to apply. Uncertainties usually carry none: there is
  // a flag to decide, but no text the machine is willing to rewrite.
  hasPatch?: boolean;
  /**
   * Whether a deterministic rule stands behind the proposed edit. A verified
   * edit replaces a value the regulator supplied, matched literally against the
   * document; an unverified one is model-drafted wording. Both need approval,
   * but a reviewer must never mistake the second for the first.
   */
  verified?: boolean;
  // The edit is still a draft. Separation of duties is enforced end to end —
  // the approver may not be the person who submitted it — so a draft must be
  // submitted by a reviewer before an approver can accept it.
  awaitingSubmission?: boolean;
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
  change: 1,
  no_change: 0,
};

export type SortKey = "relevance" | "lastUpdated" | "blastRadius" | "severity";
