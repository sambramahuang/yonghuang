import { SYSTEM_STATUS } from "../api/statusConfig";
import type { SystemStatus } from "../api/types";

interface Props {
  status: SystemStatus;
  size?: "sm" | "md";
}

export default function ImpactBadge({ status, size = "md" }: Props) {
  const cfg = SYSTEM_STATUS[status];
  const Icon = cfg.icon;
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";

  return (
    <span
      title={cfg.meaning}
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${cfg.bg} ${cfg.text} ${cfg.border} ${padding}`}
    >
      <Icon size={size === "sm" ? 12 : 14} strokeWidth={2.25} />
      {cfg.short}
    </span>
  );
}
