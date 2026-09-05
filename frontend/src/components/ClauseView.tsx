import { BookOpen, Check, ChevronDown, FileText, GitBranch, Gavel, Undo2 } from "lucide-react";
import { useState } from "react";
import { getBlastRadiusForChange, getCategoryBreakdown } from "../lib/legalGraph";
import { AUTHORITY_TYPE_LABEL, STATUS_CONFIG } from "../statusConfig";
import type { Clause, FirmDocument } from "../types";
import Redline from "./Redline";
import StatusBadge from "./StatusBadge";

interface Props {
  clause: Clause;
  documents: FirmDocument[];
  onToggleApproval: (clauseId: string, approved: boolean) => void;
}

const AUTHORITY_ICON = {
  statute: BookOpen,
  case: Gavel,
  guidance: FileText,
};

export default function ClauseView({ clause, documents, onToggleApproval }: Props) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[clause.status];
  const change = clause.change;
  const AuthorityIcon = change ? AUTHORITY_ICON[change.authorityType] : null;

  const blastRadius = change
    ? getBlastRadiusForChange(change, documents, clause.documentId)
    : [];
  const categoryBreakdown = getCategoryBreakdown(blastRadius.map((b) => b.document));
  const categoryText = Object.entries(categoryBreakdown)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? "s" : ""}`)
    .join(" · ");

  return (
    <div className="rounded-xl border border-line bg-surface p-[18px] shadow-sm">
      <div className="flex items-start justify-between gap-2.5">
        <p className="text-[14.5px] font-semibold text-ink">{clause.heading}</p>
        <StatusBadge status={clause.status} size="sm" />
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
        {clause.status === "change" && change?.redline ? (
          <Redline segments={change.redline} approved={change.approved} />
        ) : (
          clause.text
        )}
      </p>

      {change && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs italic text-ink-faint">
            {AuthorityIcon && <AuthorityIcon size={12} className="text-ink-faint" />}
            {change.authority}
          </span>

          <div className="flex shrink-0 items-center gap-2">
            {clause.status === "change" && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  change.approved
                    ? "border-good-line bg-good-bg text-good"
                    : "border-bad-line bg-bad-bg text-bad"
                }`}
              >
                {change.approved ? "Approved" : "Pending approval"}
              </span>
            )}

            {clause.status === "change" && (
              <button
                type="button"
                onClick={() => onToggleApproval(clause.id, !change.approved)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  change.approved
                    ? "border-line text-ink-soft hover:bg-surface-2"
                    : "border-good-line bg-good-bg text-good hover:opacity-80"
                }`}
              >
                {change.approved ? (
                  <>
                    <Undo2 size={11} /> Unapprove
                  </>
                ) : (
                  <>
                    <Check size={11} /> Approve suggestion
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {change && (
        <>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`inline-flex items-center gap-1 text-xs font-semibold ${cfg.text}`}
            >
              {clause.status === "uncertain" ? "Outcome pending" : "What changed"}
              <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>

          {open && (
            <div className="mt-2 rounded-xl border border-line bg-surface p-5 shadow-md">
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                  <cfg.icon size={12} /> {cfg.label} · {AUTHORITY_TYPE_LABEL[change.authorityType]}
                </span>
                <span className="font-mono text-xs text-ink-faint">{change.date}</span>
              </div>

              <p className="mt-2.5 text-sm font-semibold leading-snug text-ink">{change.summary}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{change.detail}</p>
              <p className="mt-2.5 text-xs italic text-ink-faint">Authority: {change.authority}</p>

              <div className="mt-3.5 rounded-lg bg-surface-2 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <GitBranch size={12} />
                  Blast radius: {blastRadius.length} document{blastRadius.length !== 1 ? "s" : ""} affected
                  {categoryText && <span className="font-normal text-ink-soft"> — {categoryText}</span>}
                </p>
                {blastRadius.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {blastRadius.map((b) => (
                      <li key={b.document.id} className="text-xs text-ink-soft">
                        <span className="font-medium text-ink">{b.document.title}</span>{" "}
                        <span className="text-ink-faint">({b.document.type})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
