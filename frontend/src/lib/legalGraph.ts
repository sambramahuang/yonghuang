import {
  STATUS_ORDER,
  type AuthorityType,
  type ChangeStatus,
  type Clause,
  type FirmDocType,
  type FirmDocument,
  type SortKey,
  type SuggestedChange,
} from "../types";

// Stands in for the graph backend: documents/clauses are nodes. There is no
// separate "affects" edge to maintain by hand — a clause's SuggestedChange
// cites an Authority (a statute or case, as a plain string), and blast
// radius is simply every OTHER document with a clause citing that same
// authority. Log a change once against one document, and every sibling
// citing the same authority lights up automatically — that's the whole
// propagation mechanism.

export function getDocumentById(
  documents: FirmDocument[],
  id: string,
): FirmDocument | undefined {
  return documents.find((d) => d.id === id);
}

// Clauses still carrying open work. A clause whose change has been accepted or
// rejected keeps its change for the audit trail, but drops to "no_change" — it
// no longer counts as flagged, and no longer propagates a blast radius.
export function getChangedClauses(doc: FirmDocument): Clause[] {
  return doc.clauses.filter((c) => c.change && c.status !== "no_change");
}

export interface BlastRadiusEntry {
  document: FirmDocument;
  clause: Clause;
  change: SuggestedChange;
}

// Every other document with a clause citing the same authority as `change`.
export function getBlastRadiusForChange(
  change: SuggestedChange,
  documents: FirmDocument[],
  excludeDocumentId: string,
): BlastRadiusEntry[] {
  const entries: BlastRadiusEntry[] = [];
  for (const doc of documents) {
    if (doc.id === excludeDocumentId) continue;
    for (const clause of getChangedClauses(doc)) {
      if (clause.change && clause.change.authorities.some((a) => change.authorities.includes(a))) {
        entries.push({ document: doc, clause, change: clause.change });
      }
    }
  }
  return entries;
}

// Union of blast radius across every changed clause in the document.
export function getBlastRadiusForDocument(
  doc: FirmDocument,
  documents: FirmDocument[],
): FirmDocument[] {
  const seen = new Map<string, FirmDocument>();
  for (const clause of getChangedClauses(doc)) {
    for (const entry of getBlastRadiusForChange(clause.change!, documents, doc.id)) {
      seen.set(entry.document.id, entry.document);
    }
  }
  return [...seen.values()];
}

export function getEffectiveStatus(doc: FirmDocument): ChangeStatus {
  return doc.clauses.reduce<ChangeStatus>(
    (worst, c) => (STATUS_ORDER[c.status] > STATUS_ORDER[worst] ? c.status : worst),
    "no_change",
  );
}

function textMatches(doc: FirmDocument, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    doc.title,
    doc.citation,
    doc.summary,
    doc.client,
    ...doc.practiceAreas,
    ...doc.clauses.map((c) => `${c.heading} ${c.text}`),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function relevanceScore(doc: FirmDocument, query: string): number {
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
  statuses: ChangeStatus[]; // empty = all
  types: string[]; // empty = all
  client: string; // "" = all clients
}

export function searchDocuments(
  documents: FirmDocument[],
  query: string,
  filters: SearchFilters,
  sortKey: SortKey,
): FirmDocument[] {
  let results = documents.filter((doc) => textMatches(doc, query));

  if (filters.statuses.length > 0) {
    results = results.filter((doc) => filters.statuses.includes(getEffectiveStatus(doc)));
  }
  if (filters.types.length > 0) {
    results = results.filter((doc) => filters.types.includes(doc.type));
  }
  if (filters.client) {
    results = results.filter((doc) => doc.client === filters.client);
  }

  const withScore = results.map((doc) => ({
    doc,
    relevance: relevanceScore(doc, query),
    blastRadius: getBlastRadiusForDocument(doc, documents).length,
    status: getEffectiveStatus(doc),
  }));

  withScore.sort((a, b) => {
    switch (sortKey) {
      case "lastUpdated":
        return new Date(b.doc.lastUpdated).getTime() - new Date(a.doc.lastUpdated).getTime();
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
  overallStatus: ChangeStatus;
  totalBlastRadius: number;
  bullets: { clauseHeading: string; change: SuggestedChange; blastRadius: BlastRadiusEntry[] }[];
}

export function summarizeChanges(doc: FirmDocument, documents: FirmDocument[]): ChangeSummary {
  const changed = getChangedClauses(doc);
  return {
    generatedAt: new Date().toISOString(),
    overallStatus: getEffectiveStatus(doc),
    totalBlastRadius: getBlastRadiusForDocument(doc, documents).length,
    bullets: changed.map((c) => ({
      clauseHeading: c.heading,
      change: c.change!,
      blastRadius: getBlastRadiusForChange(c.change!, documents, doc.id),
    })),
  };
}

// Blast radius belongs to the authority (the case or statute), not to
// whichever document you happen to be reading — a document is just one more
// thing that cites it. So the graph is centered on the authority, with every
// citing document (the one you're viewing included) as an equal node around
// it. A document with several distinct changes gets one graph per authority,
// rather than merging unrelated propagations into a single view.
export interface ImpactGraphNode {
  documentId: string;
  title: string;
  citation: string;
  type: FirmDocType;
  status: ChangeStatus;
  isOrigin: boolean;
}

export interface ImpactGraph {
  authority: string;
  authorityType: AuthorityType;
  nodes: ImpactGraphNode[];
}

export function buildImpactGraphs(doc: FirmDocument, documents: FirmDocument[]): ImpactGraph[] {
  const authorities = new Map<string, AuthorityType>();
  for (const clause of getChangedClauses(doc)) {
    if (!clause.change) continue;
    for (const authority of clause.change.authorities) {
      authorities.set(authority, clause.change.authorityType);
    }
  }

  return [...authorities.entries()].map(([authority, authorityType]) => {
    const citing = new Map<string, FirmDocument>();
    for (const d of documents) {
      if (getChangedClauses(d).some((c) => c.change?.authorities.includes(authority))) citing.set(d.id, d);
    }
    return {
      authority,
      authorityType,
      nodes: [...citing.values()].map((d) => ({
        documentId: d.id,
        title: d.title,
        citation: d.citation,
        type: d.type,
        status: getEffectiveStatus(d),
        isOrigin: d.id === doc.id,
      })),
    };
  });
}

export function getCategoryBreakdown(docs: FirmDocument[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of docs) counts[d.type] = (counts[d.type] ?? 0) + 1;
  return counts;
}

export function getAllTypes(documents: FirmDocument[]): string[] {
  return [...new Set(documents.map((d) => d.type))];
}

export function getAllClients(documents: FirmDocument[]): string[] {
  return [...new Set(documents.map((d) => d.client))];
}

