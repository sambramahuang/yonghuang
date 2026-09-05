import { GitBranch, History } from "lucide-react";
import { getBlastRadius, getChangedClauses } from "../lib/legalGraph";
import { STATUS_CONFIG } from "../statusConfig";
import type { LegalDocument, LegalStatus } from "../types";
import StatusBadge from "./StatusBadge";

interface Props {
  doc: LegalDocument;
  status: LegalStatus;
  active: boolean;
  onClick: () => void;
}

export default function DocumentCard({ doc, status, active, onClick }: Props) {
  const cfg = STATUS_CONFIG[status];
  const changedCount = getChangedClauses(doc).length;
  const blastRadius = getBlastRadius(doc).length;
  const isAffected = changedCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border-l-[3px] p-[18px] text-left transition ${cfg.border} ${
        active
          ? `${cfg.bg} border shadow-md`
          : "border border-line bg-surface shadow-sm hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <p className="text-[15px] font-semibold leading-snug text-ink">{doc.title}</p>
        <StatusBadge status={status} size="sm" />
      </div>
      <p className="mt-1 font-mono text-xs text-ink-soft">{doc.citation}</p>

      <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">
        {doc.summary}
      </p>

      <div className="mt-3.5 flex flex-wrap items-center gap-3.5 text-[11.5px]">
        <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-medium text-ink-soft">
          {doc.type}
        </span>
        <span className="text-ink-faint">Updated {doc.lastUpdated}</span>
        {isAffected && (
          <span className="inline-flex items-center gap-1 font-semibold text-warn">
            <History size={11} /> {changedCount} clause
            {changedCount > 1 ? "s" : ""} changed
          </span>
        )}
        {blastRadius > 0 && (
          <span className="inline-flex items-center gap-1 font-mono text-ink-soft">
            <GitBranch size={12} /> Blast radius {blastRadius}
          </span>
        )}
      </div>
    </button>
  );
}
