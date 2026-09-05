import { CHANGE_TYPE_LABEL, STATUS_CONFIG } from "../statusConfig";
import type { ChangeSummary } from "../lib/legalGraph";
import type { LegalDocument } from "../types";
import Modal from "./Modal";
import StatusBadge from "./StatusBadge";

interface Props {
  doc: LegalDocument;
  summary: ChangeSummary;
  onClose: () => void;
}

export default function SummaryModal({ doc, summary, onClose }: Props) {
  const cfg = STATUS_CONFIG[summary.overallRisk];

  return (
    <Modal title="Summary of changes in law" subtitle={doc.title} onClose={onClose} wide>
      <div className={`mb-4 flex items-center justify-between rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
            Overall risk rating
          </p>
          <div className="mt-1.5">
            <StatusBadge status={summary.overallRisk} />
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
          No tracked changes affect this document — it is currently good law with no open
          amendments, appeals, or reinterpretations.
        </p>
      ) : (
        <ul className="space-y-3">
          {summary.bullets.map(({ clauseHeading, changeEvent }, i) => {
            const bcfg = STATUS_CONFIG[
              changeEvent.type === "overturned"
                ? "overturned"
                : changeEvent.type === "pending_appeal"
                  ? "seminal_pending"
                  : "in_progress"
            ];
            return (
              <li key={changeEvent.id} className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-faint">
                    {i + 1}. {clauseHeading}
                  </span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${bcfg.bg} ${bcfg.text} ${bcfg.border}`}>
                    {CHANGE_TYPE_LABEL[changeEvent.type]}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold leading-snug text-ink">
                  {changeEvent.summary}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{changeEvent.detail}</p>
                <p className="mt-2 text-xs italic text-ink-faint">
                  Source: {changeEvent.source} · {changeEvent.date}
                </p>
                <p className="mt-2.5 border-t border-line pt-2.5 text-xs text-ink-soft">
                  <span className="font-semibold text-ink">
                    Affects {changeEvent.blastRadius.length} other document
                    {changeEvent.blastRadius.length !== 1 ? "s" : ""}:
                  </span>{" "}
                  {changeEvent.blastRadius.map((b) => b.title).join(", ")}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {summary.incomingImpacts.length > 0 && (
        <div className="mt-4 rounded-xl border border-warn-line bg-warn-bg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-warn">
            Also flagged — affected by changes ingested against other documents
          </p>
          <ul className="mt-2 space-y-1.5">
            {summary.incomingImpacts.map((impact) => (
              <li key={`${impact.originDocumentId}-${impact.changeEvent.id}`} className="text-xs text-ink-soft">
                <span className="font-medium text-ink">{impact.originDocumentTitle}</span>
                {" ("}
                {impact.clauseHeading}
                {") — "}
                {impact.changeEvent.summary}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        Generated {new Date(summary.generatedAt).toLocaleString()} from the regulatory
        change graph — the underlying source of truth is the same graph backend used to
        compute blast radius, so this summary and the impact graph never drift apart.
      </p>
    </Modal>
  );
}
