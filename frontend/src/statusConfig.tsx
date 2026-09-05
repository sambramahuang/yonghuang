import {
  AlertTriangle,
  CheckCircle2,
  RefreshCcw,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ChangeType, LegalStatus } from "./types";

interface StatusConfig {
  label: string;
  short: string;
  icon: LucideIcon;
  text: string;
  bg: string;
  border: string;
  dot: string;
}

export const STATUS_CONFIG: Record<LegalStatus, StatusConfig> = {
  good_law: {
    label: "Good law",
    short: "Good law",
    icon: CheckCircle2,
    text: "text-good",
    bg: "bg-good-bg",
    border: "border-good-line",
    dot: "bg-good",
  },
  overturned: {
    label: "Overturned / superseded",
    short: "Overturned",
    icon: XCircle,
    text: "text-bad",
    bg: "bg-bad-bg",
    border: "border-bad-line",
    dot: "bg-bad",
  },
  in_progress: {
    label: "Amendment in progress",
    short: "In progress",
    icon: RefreshCcw,
    text: "text-warn",
    bg: "bg-warn-bg",
    border: "border-warn-line",
    dot: "bg-warn",
  },
  seminal_pending: {
    label: "Seminal case pending decision",
    short: "Seminal pending",
    icon: AlertTriangle,
    text: "text-seminal",
    bg: "bg-seminal-bg",
    border: "border-seminal-line",
    dot: "bg-seminal",
  },
};

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  amendment: "Legislative amendment",
  judicial_reinterpretation: "Judicial reinterpretation",
  regulatory_guidance: "Revised regulatory guidance",
  overturned: "Overturned on appeal",
  pending_appeal: "Pending appeal / seminal case",
};
