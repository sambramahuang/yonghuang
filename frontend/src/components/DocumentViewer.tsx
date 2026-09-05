import { Download, GitBranch, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  buildImpactGraph,
  getBlastRadiusForDocument,
  getChangedClauses,
  getEffectiveStatus,
  summarizeChanges,
} from "../lib/legalGraph";
import type { FirmDocument } from "../types";
import ClauseView from "./ClauseView";
import ImpactGraphModal from "./ImpactGraphModal";
import StatusBadge from "./StatusBadge";
import SummaryModal from "./SummaryModal";

interface Props {
  doc: FirmDocument;
  documents: FirmDocument[];
  onToggleApproval: (documentId: string, clauseId: string, approved: boolean) => void;
}

export default function DocumentViewer({ doc, documents, onToggleApproval }: Props) {
  const [showSummary, setShowSummary] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

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
        status: b.change.approved ? "approved" : "unapproved",
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
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-md">
      <div className="border-b border-line p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              {doc.type} · {doc.client}
            </p>
            <h2 className="mt-1.5 font-serif text-[26px] font-medium leading-tight tracking-tight text-ink">
              {doc.title}
            </h2>
            <p className="mt-1.5 font-mono text-[13px] text-ink-soft">{doc.citation}</p>
          </div>
          <StatusBadge status={status} />
        </div>
        <p className="mt-3.5 max-w-xl text-sm leading-relaxed text-ink-soft">{doc.summary}</p>
        <p className="mt-2 text-xs text-ink-faint">Last updated {doc.lastUpdated}</p>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2.5 text-xs font-semibold text-paper shadow-sm hover:opacity-90"
          >
            <Sparkles size={14} />
            Summarise changes
          </button>
          <button
            type="button"
            onClick={() => setShowGraph(true)}
            disabled={blastRadius.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-xs font-semibold text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <GitBranch size={14} />
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-xs font-semibold text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={14} />
            Export compliance alert
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3.5 overflow-y-auto p-8">
        {doc.clauses.map((clause) => (
          <ClauseView
            key={clause.id}
            clause={clause}
            documents={documents}
            onToggleApproval={(clauseId, approved) => onToggleApproval(doc.id, clauseId, approved)}
          />
        ))}
      </div>

      {showSummary && (
        <SummaryModal doc={doc} summary={summarizeChanges(doc, documents)} onClose={() => setShowSummary(false)} />
      )}
      {showGraph && (
        <ImpactGraphModal doc={doc} graph={buildImpactGraph(doc, documents)} onClose={() => setShowGraph(false)} />
      )}
    </div>
  );
}
