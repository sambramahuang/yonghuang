import {
  CheckCircle2,
  FilePenLine,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import type { AuthorityType, ChangeStatus } from "./types";

interface StatusConfig {
  label: string;
  short: string;
  icon: LucideIcon;
  text: string;
  bg: string;
  border: string;
  dot: string;
}

export const STATUS_CONFIG: Record<ChangeStatus, StatusConfig> = {
  no_change: {
    label: "No change",
    short: "No change",
    icon: CheckCircle2,
    text: "text-good",
    bg: "bg-good-bg",
    border: "border-good-line",
    dot: "bg-good",
  },
  change: {
    label: "Change",
    short: "Change",
    icon: FilePenLine,
    text: "text-warn",
    bg: "bg-warn-bg",
    border: "border-warn-line",
    dot: "bg-warn",
  },
  uncertain: {
    label: "Uncertain",
    short: "Uncertain",
    icon: HelpCircle,
    text: "text-seminal",
    bg: "bg-seminal-bg",
    border: "border-seminal-line",
    dot: "bg-seminal",
  },
};

export const AUTHORITY_TYPE_LABEL: Record<AuthorityType, string> = {
  statute: "Statute",
  case: "Case law",
  guidance: "Regulatory guidance",
};
