import { STATUS_CONFIG } from "../statusConfig";
import type { ChangeStatus } from "../types";

interface Props {
  statuses: ChangeStatus[];
  onToggleStatus: (status: ChangeStatus) => void;
  types: string[];
  activeTypes: string[];
  onToggleType: (type: string) => void;
  open: boolean;
}

const ALL_STATUSES: ChangeStatus[] = ["change", "no_change"];

export default function FilterBar({
  statuses,
  onToggleStatus,
  types,
  activeTypes,
  onToggleType,
  open,
}: Props) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-300 ease-out ${
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div className="overflow-hidden">
        <div
          className={`flex flex-col gap-2.5 border-t border-line-soft pt-3 transition-opacity duration-200 ${
            open ? "opacity-100 delay-100" : "opacity-0"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Status
            </span>
            {ALL_STATUSES.map((status) => {
              const cfg = STATUS_CONFIG[status];
              const active = statuses.includes(status);
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
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
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
      </div>
    </div>
  );
}
