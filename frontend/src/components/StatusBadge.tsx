import { STATUS_CONFIG } from "../statusConfig";
import type { ChangeStatus } from "../types";

interface Props {
  status: ChangeStatus;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "md" }: Props) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";
  const iconSize = size === "sm" ? 12 : 14;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${cfg.bg} ${cfg.text} ${cfg.border} ${padding}`}
    >
      <Icon size={iconSize} strokeWidth={2.25} />
      {cfg.short}
    </span>
  );
}
