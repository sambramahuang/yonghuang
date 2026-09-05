import { GitBranch } from "lucide-react";
import { CHANGE_TYPE_LABEL, STATUS_CONFIG } from "../statusConfig";
import type { Clause } from "../types";

interface Props {
  clause: Clause;
}

export default function ClauseView({ clause }: Props) {
  const cfg = STATUS_CONFIG[clause.status];
  const Icon = cfg.icon;
  const changed = clause.changeEvent;

  return (
    <div
      className={`group relative rounded-xl p-[18px] ${
        changed ? `border-l-[3px] ${cfg.border} ${cfg.bg}` : `border-l-2 ${cfg.border} bg-surface`
      }`}
    >
      <div className="flex items-start gap-2.5">
        {changed && (
          <Icon size={15} className={`mt-0.5 shrink-0 ${cfg.text}`} strokeWidth={2.25} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-ink">{clause.heading}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{clause.text}</p>
        </div>
      </div>

      {changed && (
        <>
          <div className="mt-2 flex items-center gap-2 pl-6">
            <span className={`text-xs font-semibold underline decoration-dotted underline-offset-4 ${cfg.text}`}>
              {CHANGE_TYPE_LABEL[changed.type]} — hover for details
            </span>
          </div>

          <div
            role="tooltip"
            className="pointer-events-none invisible absolute left-4 right-4 top-full z-20 mt-2 rounded-xl border border-line bg-surface p-5 opacity-0 shadow-xl transition-opacity duration-150 group-hover:visible group-hover:opacity-100 sm:left-6 sm:right-auto sm:w-[26rem]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                <Icon size={12} /> {CHANGE_TYPE_LABEL[changed.type]}
              </span>
              <span className="font-mono text-xs text-ink-faint">{changed.date}</span>
            </div>

            <p className="mt-2.5 text-sm font-semibold leading-snug text-ink">
              {changed.summary}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
              {changed.detail}
            </p>
            <p className="mt-2.5 text-xs italic text-ink-faint">
              Source: {changed.source}
            </p>

            <div className="mt-3.5 rounded-lg bg-surface-2 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <GitBranch size={12} />
                Blast radius: {changed.blastRadius.length} document
                {changed.blastRadius.length !== 1 ? "s" : ""} affected
              </p>
              <ul className="mt-2 space-y-1">
                {changed.blastRadius.map((ref) => (
                  <li key={ref.documentId} className="text-xs text-ink-soft">
                    <span className="font-medium text-ink">{ref.title}</span>
                    {" — "}
                    {ref.relationship}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
