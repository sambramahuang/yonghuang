import { AUTHORITY_TYPE_LABEL, STATUS_CONFIG } from "../statusConfig";
import { getCategoryBreakdown, type ChangeSummary } from "../lib/legalGraph";
import type { FirmDocument } from "../types";
import Modal from "./Modal";
import Redline from "./Redline";
import StatusBadge from "./StatusBadge";

interface Props {
  doc: FirmDocument;
  summary: ChangeSummary;
  onClose: () => void;
}

export default function SummaryModal({ doc, summary, onClose }: Props) {
  const cfg = STATUS_CONFIG[summary.overallStatus];

  return (
    <Modal title="Summary of changes" subtitle={doc.title} onClose={onClose} wide>
      <div className={`mb-4 flex items-center justify-between rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
            Overall status
          </p>
          <div className="mt-1.5">
            <StatusBadge status={summary.overallStatus} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
            Total blast radius
          </p>
          <p className="mt-0.5 font-serif text-2xl font-medium text-ink">
            {summary.totalBlastRadius}{" "}
            <span className="font-sans text-sm font-medium text-ink-soft">documents</span>
          </p>
        </div>
      </div>

      {summary.bullets.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No tracked changes affect this document — every clause is currently unaffected.
        </p>
      ) : (
        <ul className="space-y-3">
          {summary.bullets.map(({ clauseHeading, change, blastRadius }, i) => {
            const breakdown = getCategoryBreakdown(blastRadius.map((b) => b.document));
            const breakdownText = Object.entries(breakdown)
              .map(([type, count]) => `${count} ${type}${count !== 1 ? "s" : ""}`)
              .join(" · ");
            return (
              <li key={change.id} className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-faint">
                    {i + 1}. {clauseHeading}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      change.approved
                        ? "border-good-line bg-good-bg text-good"
                        : "border-bad-line bg-bad-bg text-bad"
                    }`}
                  >
                    {change.approved ? "Accepted" : "Pending decision"}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold leading-snug text-ink">{change.summary}</p>
                {change.redline && (
                  <p className="mt-1.5 text-xs leading-relaxed">
                    <Redline segments={change.redline} approved={change.approved} />
                  </p>
                )}
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{change.detail}</p>
                <p className="mt-2 text-xs italic text-ink-faint">
                  Authority: {change.authority} ({AUTHORITY_TYPE_LABEL[change.authorityType]}) · {change.date}
                </p>
                <p className="mt-2.5 border-t border-line pt-2.5 text-xs text-ink-soft">
                  <span className="font-semibold text-ink">
                    Affects {blastRadius.length} other document{blastRadius.length !== 1 ? "s" : ""}
                    {breakdownText ? ` (${breakdownText})` : ""}:
                  </span>{" "}
                  {blastRadius.length > 0
                    ? blastRadius.map((b) => b.document.title).join(", ")
                    : "none"}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        Generated {new Date(summary.generatedAt).toLocaleString()} from the document graph — blast
        radius here and in the graph view are computed from the same authority citations, so they
        never drift apart.
      </p>
    </Modal>
  );
}
