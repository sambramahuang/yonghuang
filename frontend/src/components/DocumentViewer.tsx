import { Download, GitBranch, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { useState } from "react";
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

interface Props {
  doc: FirmDocument;
  documents: FirmDocument[];
  canApprove: boolean;
  canSubmit: boolean;
  busyClauseId: string | null;
  onResolve: (documentId: string, clauseId: string, action: ResolveAction, reason?: RejectionReason) => void;
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

  const status = getEffectiveStatus(doc);
  const changedCount = getChangedClauses(doc).length;
  const blastRadius = getBlastRadiusForDocument(doc, documents);

  function handleExport() {
    const summary = summarizeChanges(doc, documents);
    const payload = {
      document: { id: doc.id, title: doc.title, citation: doc.citation, client: doc.client, type: doc.type },
      exportedAt: new Date().toISOString(),
      overallStatus: summary.overallStatus,
      blastRadius: blastRadius.map((d) => ({ id: d.id, title: d.title, type: d.type })),
      changes: summary.bullets.map((b) => ({
        clause: b.clauseHeading,
        authority: b.change.authority,
        status: b.change.resolution ?? "open",
        summary: b.change.summary,
        detail: b.change.detail,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.id}-compliance-alert.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-40 bg-ink/45" onClick={() => setExpanded(false)} />
      )}
      <div
        className={
          expanded
            ? "fixed inset-6 z-50 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
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
              disabled={blastRadius.length === 0}
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
            <button
              type="button"
              onClick={handleExport}
              disabled={changedCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={13} />
              Export compliance alert
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-surface-2 p-8">
          <DocumentPaper
            doc={doc}
            documents={documents}
            canApprove={canApprove}
            canSubmit={canSubmit}
            busyClauseId={busyClauseId}
            onResolve={(clauseId, action, reason) => onResolve(doc.id, clauseId, action, reason)}
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
