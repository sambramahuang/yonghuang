import { STATUS_CONFIG } from "../statusConfig";
import type { ChangeStatus } from "../types";

interface Props {
  statuses: ChangeStatus[];
  onToggleStatus: (status: ChangeStatus) => void;
  types: string[];
  activeTypes: string[];
  onToggleType: (type: string) => void;
}

const ALL_STATUSES: ChangeStatus[] = ["change", "no_change", "uncertain"];

export default function FilterBar({
  statuses,
  onToggleStatus,
  types,
  activeTypes,
  onToggleType,
}: Props) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          Status
        </span>
        {ALL_STATUSES.map((status) => {
          const cfg = STATUS_CONFIG[status];
          const active = statuses.includes(status);
          const Icon = cfg.icon;
          return (
            <button
              key={status}
              type="button"
              onClick={() => onToggleStatus(status)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                  : "border-line bg-surface text-ink-faint hover:border-line-soft"
              }`}
            >
              <Icon size={12} strokeWidth={2.25} />
              {cfg.short}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          Type
        </span>
        {types.map((type) => {
          const active = activeTypes.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => onToggleType(type)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? "border-accent bg-accent text-paper"
                  : "border-line bg-surface text-ink-faint hover:border-line-soft"
              }`}
            >
              {type}
            </button>
          );
        })}
      </div>
    </div>
  );
}
