import {
  STATUS_ORDER,
  type AffectedDocRef,
  type ChangeEvent,
  type ChangeType,
  type Clause,
  type LegalDocument,
  type LegalStatus,
  type SortKey,
} from "../types";

// This module stands in for the graph backend described in the problem
// statement: documents/clauses are nodes, ChangeEvent.blastRadius entries
// are edges. Every function here is a candidate to become a real graph
// query (e.g. Cypher "MATCH (c:Clause)-[:AFFECTS]->(d:Document)") once the
// backend exists — the UI already consumes data in that shape, and holds
// no document state of its own (App owns the array; these are pure
// functions over it), the same way a client would talk to a real graph API.

export function getDocumentById(
  documents: LegalDocument[],
  id: string,
): LegalDocument | undefined {
  return documents.find((d) => d.id === id);
}

export function getChangedClauses(doc: LegalDocument): Clause[] {
  return doc.clauses.filter((c) => c.changeEvent);
}

export function getBlastRadius(doc: LegalDocument): AffectedDocRef[] {
  const seen = new Map<string, AffectedDocRef>();
  for (const clause of doc.clauses) {
    if (!clause.changeEvent) continue;
    for (const ref of clause.changeEvent.blastRadius) {
      if (!seen.has(ref.documentId)) seen.set(ref.documentId, ref);
    }
  }
  return [...seen.values()];
}

// A change ingested against one document doesn't need to rewrite every
// downstream document it touches — it just needs to be findable from them.
// This is the reverse of getBlastRadius: everywhere else in the graph that
// named this document as affected.
export interface IncomingImpact {
  originDocumentId: string;
  originDocumentTitle: string;
  clauseId: string;
  clauseHeading: string;
  changeEvent: ChangeEvent;
  relationship: string;
}

export function getIncomingImpacts(
  doc: LegalDocument,
  documents: LegalDocument[],
): IncomingImpact[] {
  const impacts: IncomingImpact[] = [];
  for (const other of documents) {
    if (other.id === doc.id) continue;
    for (const clause of other.clauses) {
      if (!clause.changeEvent) continue;
      const ref = clause.changeEvent.blastRadius.find(
        (r) => r.documentId === doc.id,
      );
      if (ref) {
        impacts.push({
          originDocumentId: other.id,
          originDocumentTitle: other.title,
          clauseId: clause.id,
          clauseHeading: clause.heading,
          changeEvent: clause.changeEvent,
          relationship: ref.relationship,
        });
      }
    }
  }
  return impacts;
}

function impliedStatus(type: ChangeType): LegalStatus {
  switch (type) {
    case "overturned":
      return "overturned";
    case "pending_appeal":
      return "seminal_pending";
    case "amendment":
    case "judicial_reinterpretation":
    case "regulatory_guidance":
      return "in_progress";
  }
}

// The whole point of tracking incoming impacts: a document's badge in
// search results reflects changes ingested anywhere in the graph, not just
// edits made directly to its own clauses.
export function getEffectiveStatus(
  doc: LegalDocument,
  documents: LegalDocument[],
): LegalStatus {
  const clauseStatus = doc.clauses.reduce<LegalStatus>(
    (worst, c) => (STATUS_ORDER[c.status] > STATUS_ORDER[worst] ? c.status : worst),
    "good_law",
  );
  const incomingStatus = getIncomingImpacts(doc, documents).reduce<LegalStatus>(
    (worst, impact) => {
      const s = impliedStatus(impact.changeEvent.type);
      return STATUS_ORDER[s] > STATUS_ORDER[worst] ? s : worst;
    },
    "good_law",
  );
  return STATUS_ORDER[incomingStatus] > STATUS_ORDER[clauseStatus]
    ? incomingStatus
    : clauseStatus;
}

function textMatches(doc: LegalDocument, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    doc.title,
    doc.citation,
    doc.summary,
    ...doc.practiceAreas,
    ...doc.clauses.map((c) => `${c.heading} ${c.text}`),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function relevanceScore(doc: LegalDocument, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  let score = 0;
  if (doc.title.toLowerCase().includes(q)) score += 5;
  if (doc.citation.toLowerCase().includes(q)) score += 3;
  if (doc.practiceAreas.some((p) => p.toLowerCase().includes(q))) score += 2;
  for (const clause of doc.clauses) {
    if (clause.heading.toLowerCase().includes(q)) score += 2;
    if (clause.text.toLowerCase().includes(q)) score += 1;
  }
  return score;
}

export interface SearchFilters {
  statuses: LegalStatus[]; // empty = all
  types: string[]; // empty = all
}

export function searchDocuments(
  documents: LegalDocument[],
  query: string,
  filters: SearchFilters,
  sortKey: SortKey,
): LegalDocument[] {
  let results = documents.filter((doc) => textMatches(doc, query));

  if (filters.statuses.length > 0) {
    results = results.filter((doc) =>
      filters.statuses.includes(getEffectiveStatus(doc, documents)),
    );
  }
  if (filters.types.length > 0) {
    results = results.filter((doc) => filters.types.includes(doc.type));
  }

  const withScore = results.map((doc) => ({
    doc,
    relevance: relevanceScore(doc, query),
    blastRadius: getBlastRadius(doc).length,
    status: getEffectiveStatus(doc, documents),
  }));

  withScore.sort((a, b) => {
    switch (sortKey) {
      case "lastUpdated":
        return (
          new Date(b.doc.lastUpdated).getTime() -
          new Date(a.doc.lastUpdated).getTime()
        );
      case "blastRadius":
        return b.blastRadius - a.blastRadius;
      case "severity":
        return STATUS_ORDER[b.status] - STATUS_ORDER[a.status];
      case "relevance":
      default:
        if (b.relevance !== a.relevance) return b.relevance - a.relevance;
        return STATUS_ORDER[b.status] - STATUS_ORDER[a.status];
    }
  });

  return withScore.map((w) => w.doc);
}

export interface ChangeSummary {
  generatedAt: string;
  overallRisk: LegalStatus;
  totalBlastRadius: number;
  bullets: { clauseHeading: string; changeEvent: ChangeEvent }[];
  incomingImpacts: IncomingImpact[];
}

// Deterministically synthesises the "summarise changes in law" report from
// the document's own change events plus anything upstream that has flagged
// it, rather than calling out to an LLM — it demonstrates the feature
// against data the graph backend would supply.
export function summarizeChanges(
  doc: LegalDocument,
  documents: LegalDocument[],
): ChangeSummary {
  const changed = getChangedClauses(doc);

  return {
    generatedAt: new Date().toISOString(),
    overallRisk: getEffectiveStatus(doc, documents),
    totalBlastRadius: getBlastRadius(doc).length,
    bullets: changed.map((c) => ({
      clauseHeading: c.heading,
      changeEvent: c.changeEvent!,
    })),
    incomingImpacts: getIncomingImpacts(doc, documents),
  };
}

export interface GraphNode {
  id: string;
  title: string;
  citation: string;
  status: LegalStatus;
  isCenter: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface ImpactGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildImpactGraph(
  doc: LegalDocument,
  documents: LegalDocument[],
): ImpactGraph {
  const blastRadius = getBlastRadius(doc);
  const nodes: GraphNode[] = [
    {
      id: doc.id,
      title: doc.title,
      citation: doc.citation,
      status: getEffectiveStatus(doc, documents),
      isCenter: true,
    },
    ...blastRadius.map((ref) => {
      const refDoc = getDocumentById(documents, ref.documentId);
      return {
        id: ref.documentId,
        title: ref.title,
        citation: ref.citation,
        status: refDoc ? getEffectiveStatus(refDoc, documents) : "good_law",
        isCenter: false,
      };
    }),
  ];

  const edges: GraphEdge[] = blastRadius.map((ref) => ({
    source: doc.id,
    target: ref.documentId,
    relationship: ref.relationship,
  }));

  return { nodes, edges };
}

export function getAllTypes(documents: LegalDocument[]): string[] {
  return [...new Set(documents.map((d) => d.type))];
}

// --- Upload / ingestion pipeline -------------------------------------

const STOPWORDS = new Set([
  "about", "after", "again", "against", "amend", "amended", "amendment",
  "before", "being", "between", "cannot", "could", "director", "during",
  "either", "from", "have", "into", "material", "reasonable", "shall",
  "should", "system", "systems", "that", "their", "them", "these", "this",
  "those", "under", "unless", "where", "which", "while", "with", "would",
]);

function extractKeywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4 && !STOPWORDS.has(w)),
    ),
  ];
}

export interface DetectedImpact {
  documentId: string;
  title: string;
  citation: string;
  reason: string;
  score: number;
}

// Simulates automatic ingestion: given the free text a lawyer just typed
// describing a change, scan every other document in the corpus for shared
// practice areas and overlapping vocabulary, and rank them as candidate
// blast-radius targets. A real backend would do this with embeddings over
// the graph; the shape of the result — a ranked, explainable candidate
// list a human confirms — stays the same either way.
export function detectAffectedDocuments(
  documents: LegalDocument[],
  originDocumentId: string,
  summary: string,
  detail: string,
): DetectedImpact[] {
  const origin = getDocumentById(documents, originDocumentId);
  const keywords = extractKeywords(`${summary} ${detail}`);
  const results: DetectedImpact[] = [];

  for (const doc of documents) {
    if (doc.id === originDocumentId) continue;
    let score = 0;
    const reasons: string[] = [];

    if (origin) {
      const sharedAreas = doc.practiceAreas.filter((a) =>
        origin.practiceAreas.includes(a),
      );
      if (sharedAreas.length > 0) {
        score += sharedAreas.length * 3;
        reasons.push(`shares practice area: ${sharedAreas.join(", ")}`);
      }
    }

    const haystack = `${doc.title} ${doc.summary} ${doc.clauses
      .map((c) => `${c.heading} ${c.text}`)
      .join(" ")}`.toLowerCase();
    const matched = keywords.filter((k) => haystack.includes(k));
    // A single incidental word overlap (e.g. both texts happen to say
    // "require") isn't a real signal on its own — only count textual
    // overlap once there's more than one matching term.
    if (matched.length >= 2) {
      score += matched.length * 2;
      reasons.push(`matches "${matched.slice(0, 3).join('", "')}"`);
    }

    if (score > 0) {
      results.push({
        documentId: doc.id,
        title: doc.title,
        citation: doc.citation,
        reason: reasons.join(" · "),
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

function statusForChangeType(type: ChangeType): LegalStatus {
  return impliedStatus(type);
}

export interface ChangeDraft {
  originDocumentId: string;
  originClauseId: string;
  type: ChangeType;
  date: string;
  source: string;
  summary: string;
  detail: string;
  affected: AffectedDocRef[];
}

export interface IngestResult {
  documents: LegalDocument[];
  originTitle: string;
  clauseHeading: string;
  newStatus: LegalStatus;
  affectedCount: number;
}

// The lawyer's upload becomes one new ChangeEvent attached to the clause it
// originates from. Nothing downstream is rewritten — every affected
// document picks the change up the next time its status or impacts are
// queried, via getEffectiveStatus / getIncomingImpacts above. That's the
// "propagates automatically" part: propagation is a read, not a write.
export function ingestChange(
  documents: LegalDocument[],
  draft: ChangeDraft,
): IngestResult {
  const origin = getDocumentById(documents, draft.originDocumentId);
  const clause = origin?.clauses.find((c) => c.id === draft.originClauseId);
  const newStatus = statusForChangeType(draft.type);

  const changeEvent: ChangeEvent = {
    id: `ce-upload-${Date.now()}`,
    type: draft.type,
    date: draft.date,
    source: draft.source,
    summary: draft.summary,
    detail: draft.detail,
    blastRadius: draft.affected,
  };

  const updatedDocuments = documents.map((doc) => {
    if (doc.id !== draft.originDocumentId) return doc;
    return {
      ...doc,
      lastUpdated: draft.date,
      clauses: doc.clauses.map((c) =>
        c.id === draft.originClauseId ? { ...c, status: newStatus, changeEvent } : c,
      ),
    };
  });

  return {
    documents: updatedDocuments,
    originTitle: origin?.title ?? draft.originDocumentId,
    clauseHeading: clause?.heading ?? draft.originClauseId,
    newStatus,
    affectedCount: draft.affected.length,
  };
}
