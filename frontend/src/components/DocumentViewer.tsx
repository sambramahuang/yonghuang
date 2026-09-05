import { GitBranch, Maximize2, Minimize2, Pencil, Save, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildImpactGraphs,
  getBlastRadiusForDocument,
  getChangedClauses,
  getEffectiveStatus,
  summarizeChanges,
} from "../lib/legalGraph";
import type { RejectionReason } from "../api/types";
import type { FirmDocument } from "../types";
import DocumentPaper, { type ResolveAction } from "./DocumentPaper";
import ImpactGraphModal from "./ImpactGraphModal";
import StatusBadge from "./StatusBadge";
import SummaryModal from "./SummaryModal";

// Ambient artwork shown behind the paper, inside the panel — re-rolled
// whenever a different document is opened.
const PAPER_BACKGROUNDS = [
  "/backgrounds/paper-bg-1.png",
  "/backgrounds/paper-bg-2.png",
  "/backgrounds/paper-bg-3.png",
];

function randomBackground() {
  return PAPER_BACKGROUNDS[Math.floor(Math.random() * PAPER_BACKGROUNDS.length)];
}

interface Props {
  doc: FirmDocument;
  documents: FirmDocument[];
  canApprove: boolean;
  canSubmit: boolean;
  busyClauseId: string | null;
  onResolve: (
    documentId: string,
    clauseId: string,
    action: ResolveAction,
    reason?: RejectionReason,
    text?: string,
  ) => void | Promise<void>;
}

export default function DocumentViewer({
  doc,
  documents,
  canApprove,
  canSubmit,
  busyClauseId,
  onResolve,
}: Props) {
  const [showSummary, setShowSummary] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [background, setBackground] = useState(randomBackground);
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const status = getEffectiveStatus(doc);
  const blastRadius = getBlastRadiusForDocument(doc, documents);

  // Re-roll the backdrop every time a different document is opened.
  useEffect(() => {
    setBackground(randomBackground());
  }, [doc.id]);

  // Leaving a document mid-edit drops the draft session — reopening it
  // re-fetches from the server rather than reviving stale typed text.
  useEffect(() => {
    setEditMode(false);
    setDrafts({});
  }, [doc.id]);

  const dirtyClauses = useMemo(
    () =>
      doc.clauses.filter((c) => {
        const draft = drafts[c.id];
        return draft !== undefined && draft.trim() !== "" && draft !== (c.change?.patchText ?? "");
      }),
    [doc.clauses, drafts],
  );

  function handleDraftChange(clauseId: string, text: string) {
    setDrafts((prev) => ({ ...prev, [clauseId]: text }));
  }

  // One "Save" for the whole document: each touched clause is drafted then
  // submitted in turn — the same two API calls the old per-clause Edit /
  // Submit buttons made, just run together so a reviewer edits the document
  // like a document and sends it for approval once, at the end.
  async function handleSaveChanges() {
    if (dirtyClauses.length === 0) return;
    setSaving(true);
    try {
      for (const clause of dirtyClauses) {
        await onResolve(doc.id, clause.id, "edit", undefined, drafts[clause.id]);
        await onResolve(doc.id, clause.id, "submit");
      }
      setDrafts({});
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-40 bg-ink/45" onClick={() => setExpanded(false)} />
      )}
      <div
        className={
          expanded
            ? "fixed inset-y-6 left-1/2 z-50 flex w-[min(1040px,calc(100vw-3rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
            : "relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-md"
        }
      >
        <div className="border-b border-line px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {doc.type} · {doc.client}
              </p>
              <h2 className="mt-1 text-[19px] font-bold leading-snug tracking-tight text-ink">
                {doc.title}
              </h2>
              <p className="mt-1 font-mono text-[11.5px] text-ink-soft">{doc.citation}</p>
            </div>
            <StatusBadge status={status} size="sm" />
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{doc.summary}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs">
            {blastRadius.length > 0 && (
              <p className="text-ink-soft">
                <span className="font-bold text-brand">{blastRadius.length}</span> other document
                {blastRadius.length !== 1 ? "s" : ""} affected by changes logged here
              </p>
            )}
            <p className="text-ink-faint">Last updated {doc.lastUpdated}</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowSummary(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper shadow-sm hover:opacity-90"
            >
              <Sparkles size={13} />
              Summarise changes
            </button>
            <button
              type="button"
              onClick={() => setShowGraph(true)}
              disabled={getChangedClauses(doc).length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GitBranch size={13} />
              View blast radius graph
              {blastRadius.length > 0 && (
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                  {blastRadius.length}
                </span>
              )}
            </button>
            {canSubmit && (
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  editMode
                    ? "border-accent bg-accent text-paper"
                    : "border-line bg-surface text-ink hover:bg-surface-2"
                }`}
              >
                <Pencil size={13} />
                {editMode ? "Exit edit mode" : "Edit mode"}
              </button>
            )}
            {editMode && (
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={dirtyClauses.length === 0 || saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-paper shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save size={13} />
                {saving
                  ? "Saving…"
                  : dirtyClauses.length > 0
                    ? `Save & send for approval (${dirtyClauses.length})`
                    : "Save & send for approval"}
              </button>
            )}
          </div>
          {editMode && (
            <p className="mt-2 text-[11px] text-ink-faint">
              Type directly into any flagged clause below. Clauses with no proposed edit are marked for
              review only. Saving submits everything you've changed for an approver to accept.
            </p>
          )}
        </div>

        <div
          className="flex-1 overflow-y-auto bg-surface-2 bg-cover bg-center bg-no-repeat p-8"
          style={expanded ? undefined : { backgroundImage: `url(${background})` }}
        >
          <DocumentPaper
            doc={doc}
            documents={documents}
            canApprove={canApprove}
            canSubmit={canSubmit}
            busyClauseId={busyClauseId}
            onResolve={(clauseId, action, reason, text) => onResolve(doc.id, clauseId, action, reason, text)}
            editMode={editMode}
            drafts={drafts}
            onDraftChange={handleDraftChange}
          />
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse" : "Expand for a closer look"}
          className="absolute bottom-4 right-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-soft shadow-md hover:bg-surface-2 hover:text-ink"
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {showSummary && (
        <SummaryModal doc={doc} summary={summarizeChanges(doc, documents)} onClose={() => setShowSummary(false)} />
      )}
      {showGraph && (
        <ImpactGraphModal graphs={buildImpactGraphs(doc, documents)} onClose={() => setShowGraph(false)} />
      )}
    </>
  );
}
