import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { ImpactSummary, ProposedPatch, SystemStatus } from "../api/types";
import type {
  ChangeResolution,
  ChangeStatus,
  Clause,
  FirmDocType,
  FirmDocument,
  TextSegment,
} from "../types";

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

/**
 * The clause text once an accepted patch has been applied — the same splice the
 * backend performs when it writes the new version, done locally so the clause
 * reads as settled prose the moment the approval lands, without waiting for the
 * next analysis run to re-segment the artefact.
 */
function applyPatch(text: string, patch: ProposedPatch | null, offset: number): string {
  if (!patch) return text;
  if (patch.kind === "TEXT") return patch.new;
  const start = patch.start - offset;
  const end = patch.end - offset;
  if (start < 0 || end > text.length || start >= end) return text.replace(patch.old, patch.new);
  return text.slice(0, start) + patch.new + text.slice(end);
}

const RESOLUTION: Record<string, ChangeResolution> = {
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  ESCALATED: "escalated",
};

function toClause(impact: ImpactSummary, updateTitle: string): Clause {
  // segment_text is the clause; patch offsets are absolute, so the clause's
  // own start is needed to place the redline within it. The list endpoint does
  // not carry char_start, so a VALUE patch is located by its old value instead.
  const text = impact.segment_text ?? "";
  const patch = impact.proposed_patch;
  let offset = 0;
  if (patch && patch.kind !== "TEXT") {
    const local = text.indexOf(patch.old);
    offset = local >= 0 ? patch.start - local : patch.start;
  }
  // A resolved finding is settled: it no longer flags the document, so it drops
  // to "no change" and the redline is collapsed into plain text — the accepted
  // wording if it was approved, the untouched original if it was rejected.
  const resolution = impact.resolution ? RESOLUTION[impact.resolution] : null;
  const settledText = resolution === "accepted" ? applyPatch(text, patch, offset) : text;

  return {
    id: `impact-${impact.id}`,
    documentId: `artefact-${impact.artefact_id}`,
    heading: impact.locator ? `${impact.locator} — ${impact.concept}` : impact.concept,
    text: settledText,
    status: resolution ? "no_change" : STATUS[impact.system_status] ?? "uncertain",
    change: {
      id: `change-${impact.id}`,
      authority: updateTitle,
      authorityType: "statute",
      date: impact.resolved_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      summary: impact.explanation,
      detail: impact.explanation,
      redline: resolution ? undefined : toRedline(text, patch, offset),
      approved: impact.resolution === "ACCEPTED",
      resolution,
      hasPatch: !!patch,
      awaitingSubmission: !!patch && impact.workflow_state === "DRAFT",
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
        const updateTitle = updates[0]?.title ?? "Regulatory update";
        const impacts = await api.impacts();
        if (!live) return;

        const byArtefact = new Map<string, ImpactSummary[]>();
        for (const impact of impacts) {
          const key = String(impact.artefact_id);
          if (!byArtefact.has(key)) byArtefact.set(key, []);
          byArtefact.get(key)!.push(impact);
        }

        setDocuments(
          artefacts.map((a) => {
            const found = byArtefact.get(String(a.id)) ?? [];
            // Resolved findings stay on the document as settled clauses, but
            // they are no longer open work, so the summary counts only the rest.
            const open = found.filter((i) => i.resolution === null);
            return {
              id: `artefact-${a.id}`,
              title: a.name,
              citation: `Version ${a.version}`,
              type: docType(a.name, (a as { type?: string }).type),
              client: "Firm-wide",
              practiceAreas: [...new Set(found.map((i) => i.concept))].slice(0, 3),
              lastUpdated: new Date().toISOString().slice(0, 10),
              summary: open.length
                ? `${open.length} open finding${open.length === 1 ? "" : "s"} against ${updateTitle}.`
                : found.length
                  ? `All ${found.length} finding${found.length === 1 ? "" : "s"} against ${updateTitle} have been resolved.`
                  : "No findings against the current regulatory update.",
              clauses: found.map((i) => toClause(i, updateTitle)),
            };
          }),
        );
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
