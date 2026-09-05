import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { ImpactSummary, ProposedPatch, SystemStatus } from "../api/types";
import type { ChangeStatus, Clause, FirmDocType, FirmDocument, TextSegment } from "../types";

/**
 * Adapts the backend's artefacts and impact findings into the FirmDocument
 * shape this UI renders.
 *
 * The two models describe the same thing at different altitudes: the backend
 * keys everything to a *segment* of an artefact version with exact character
 * offsets, while the UI wants documents made of clauses. One finding becomes
 * one clause; artefacts with no finding still appear, so "not affected" is
 * visible rather than absent.
 */

// The backend's four machine verdicts collapse to the three the UI shows.
// LEGAL_REVIEW_REQUIRED and POSSIBLE_IMPACT both mean "a human must look",
// which is exactly what "uncertain" conveys.
const STATUS: Record<SystemStatus, ChangeStatus> = {
  UPDATE_NEEDED: "change",
  LEGAL_REVIEW_REQUIRED: "uncertain",
  POSSIBLE_IMPACT: "uncertain",
  CURRENT: "no_change",
};

/** Infers a document type from the artefact's filename and declared type. */
function docType(name: string, type: string | undefined): FirmDocType {
  const n = name.toLowerCase();
  if (type === "playbook" || n.includes("playbook")) return "Playbook";
  if (type === "config" || n.endsWith(".json")) return "Automated Compliance Tool";
  if (type === "template" || n.includes("template")) return "Template Clause";
  if (type === "training" || n.includes("training")) return "Training Material";
  if (n.includes("checklist")) return "Checklist";
  if (n.includes("advisory")) return "Client Advisory";
  if (n.includes("agreement") || n.includes("contract")) return "Contract";
  if (n.includes("manual") || n.includes("handbook") || n.includes("faq")) return "Workflow";
  return "Contract";
}

/**
 * Renders a patch as track-changes segments. A VALUE patch replaces a number
 * inside the clause, so the surrounding text is carried through unchanged; a
 * TEXT patch replaces the whole clause, so it reads as one deletion and one
 * insertion.
 */
function toRedline(text: string, patch: ProposedPatch | null, offset: number): TextSegment[] | undefined {
  if (!patch) return undefined;
  if (patch.kind === "TEXT") {
    return [
      { text: patch.old, kind: "deleted" },
      { text: patch.new, kind: "inserted" },
    ];
  }
  // Offsets are absolute within the version's raw_text; rebase onto the clause.
  const start = patch.start - offset;
  const end = patch.end - offset;
  if (start < 0 || end > text.length || start >= end) {
    return [
      { text: patch.old, kind: "deleted" },
      { text: patch.new, kind: "inserted" },
    ];
  }
  const segments: TextSegment[] = [
    { text: text.slice(0, start), kind: "same" },
    { text: text.slice(start, end), kind: "deleted" },
    { text: patch.new, kind: "inserted" },
    { text: text.slice(end), kind: "same" },
  ];
  return segments.filter((s) => s.text.length > 0);
}

interface Segment {
  id: number;
  ordinal: number;
  locator: string;
  text: string;
  char_start: number;
}

/**
 * One clause per segment, so the reader sees the whole document and can judge
 * a flagged paragraph in its own context. A segment with no finding is plain
 * text with status "no_change"; a finding contributes the status and redline.
 */
function toClause(segment: Segment, artefactId: string, impact: ImpactSummary | undefined, updateTitles: Map<string, string>): Clause {
  const text = segment.text ?? "";
  const base: Clause = {
    id: impact ? `impact-${impact.id}` : `segment-${segment.id}`,
    documentId: `artefact-${artefactId}`,
    heading: segment.locator,
    text,
    status: "no_change",
  };
  if (!impact) return base;

  // Patch offsets are absolute within the version's raw_text; the segment's
  // own start rebases them onto this clause.
  const patch = impact.proposed_patch;
  const authority = updateTitles.get(String(impact.update_id)) ?? "Regulatory update";
  return {
    ...base,
    status: STATUS[impact.system_status] ?? "uncertain",
    change: {
      id: `change-${impact.id}`,
      authority,
      authorityType: "statute",
      date: impact.resolved_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      summary: impact.explanation,
      detail: impact.explanation,
      redline: toRedline(text, patch, segment.char_start),
      approved: impact.resolution === "ACCEPTED",
    },
  };
}

export interface LiveState {
  documents: FirmDocument[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Impact id for a clause id, so actions can be sent back to the API. */
  impactIdFor: (clauseId: string) => string | null;
}

export function useLiveDocuments(token: string): LiveState {
  const [documents, setDocuments] = useState<FirmDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!token) {
      setDocuments([]);
      return;
    }
    let live = true;
    setLoading(true);
    (async () => {
      try {
        const [artefacts, updates] = await Promise.all([api.artefacts(), api.regulatoryUpdates()]);
        const updateTitles = new Map(updates.map((u) => [String(u.id), u.title]));
        const impacts = await api.impacts();
        if (!live) return;

        const byArtefact = new Map<string, ImpactSummary[]>();
        for (const impact of impacts) {
          const key = String(impact.artefact_id);
          if (!byArtefact.has(key)) byArtefact.set(key, []);
          byArtefact.get(key)!.push(impact);
        }

        // Render the list from the summary data first. Fetching every
        // artefact's full text before the first paint left the sign-in button
        // spinning for seconds on a corpus of this size.
        const shell = (detailFor: Map<string, { segments?: Segment[] }>) =>
          artefacts.map((a) => {
            const found = byArtefact.get(String(a.id)) ?? [];
            const bySegment = new Map(found.map((i) => [String(i.segment_id), i]));
            const segments = detailFor.get(String(a.id))?.segments ?? [];
            const clauses = segments.length
              ? segments.map((seg) => toClause(seg, String(a.id), bySegment.get(String(seg.id)), updateTitles))
              : found.map((i) =>
                  toClause(
                    { id: Number(i.segment_id), ordinal: 0, locator: i.locator, text: i.segment_text ?? "", char_start: 0 },
                    String(a.id),
                    i,
                    updateTitles,
                  ),
                );
            return {
              id: `artefact-${a.id}`,
              title: a.name,
              citation: `Version ${a.version}`,
              type: docType(a.name, (a as { type?: string }).type),
              client: "Firm-wide",
              practiceAreas: [...new Set(found.map((i) => i.concept))].slice(0, 3),
              lastUpdated: new Date().toISOString().slice(0, 10),
              summary: found.length
                ? `${found.length} finding${found.length === 1 ? "" : "s"} against ${
                    [...new Set(found.map((i) => updateTitles.get(String(i.update_id)) ?? "a regulatory update"))].join("; ")
                  }.`
                : "No findings against any current regulatory update.",
              clauses,
            };
          });

        const details = new Map<string, { segments?: Segment[] }>();
        setDocuments(shell(details));
        setLoading(false);

        // Then fill in full text per artefact, refreshing as each arrives.
        await Promise.all(
          artefacts.map(async (a) => {
            try {
              const detail = await api.artefact(String(a.id));
              details.set(String(a.id), detail as { segments?: Segment[] });
              if (live) setDocuments(shell(details));
            } catch {
              /* a document that will not load simply keeps its finding-only view */
            }
          }),
        );
        if (!live) return;
        setError(null);
      } catch (e) {
        if (live) setError(e instanceof ApiError ? e.message : "Failed to load documents");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [token, tick]);

  return {
    documents,
    loading,
    error,
    reload,
    impactIdFor: (clauseId) => (clauseId.startsWith("impact-") ? clauseId.slice("impact-".length) : null),
  };
}
