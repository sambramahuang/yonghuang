import { RESOLUTION_LABEL } from "../api/statusConfig";
import type { ImpactSummary } from "../api/types";
import ImpactBadge from "./ImpactBadge";

interface Props {
  impact: ImpactSummary;
  active: boolean;
  onClick: () => void;
}

export default function ImpactCard({ impact, active, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3.5 text-left transition ${
        active
          ? "border-accent bg-surface shadow-sm"
          : "border-line bg-surface hover:border-line-soft hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-ink">{impact.name}</span>
        <ImpactBadge status={impact.system_status} size="sm" />
      </div>
      <p className="mt-1.5 line-clamp-2 font-serif text-sm text-ink-soft">{impact.segment_text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-faint">
        <span>{impact.locator}</span>
        <span>·</span>
        <span>{impact.concept}</span>
        {impact.proposed_patch && (
          <>
            <span>·</span>
            <span className="text-ink-soft">
              {impact.proposed_patch.old} → {impact.proposed_patch.new}
            </span>
          </>
        )}
        {impact.resolution && (
          <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5">
            {RESOLUTION_LABEL[impact.resolution]}
          </span>
        )}
      </div>
    </button>
  );
}
