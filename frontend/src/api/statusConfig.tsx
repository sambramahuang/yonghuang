import {
  AlertTriangle,
  CheckCircle2,
  Scale,
  RefreshCcw,
  type LucideIcon,
} from "lucide-react";
import type { EvidenceTier, Resolution, SystemStatus, WorkflowState } from "./types";

interface StatusConfig {
  label: string;
  short: string;
  meaning: string;
  icon: LucideIcon;
  text: string;
  bg: string;
  border: string;
  dot: string;
}

// Reuses the palette tokens already defined in index.css so the API statuses
// inherit the existing visual language rather than introducing new colours.
export const SYSTEM_STATUS: Record<SystemStatus, StatusConfig> = {
  UPDATE_NEEDED: {
    label: "Update needed",
    short: "Update needed",
    meaning:
      "A structured claim states the old legal position in the present tense. A patch is proposed.",
    icon: RefreshCcw,
    text: "text-bad",
    bg: "bg-bad-bg",
    border: "border-bad-line",
    dot: "bg-bad",
  },
  LEGAL_REVIEW_REQUIRED: {
    label: "Legal review required",
    short: "Legal review",
    meaning:
      "The claim hit the competence boundary — a qualifier, condition, or entangled law and policy. No patch is offered.",
    icon: Scale,
    text: "text-seminal",
    bg: "bg-seminal-bg",
    border: "border-seminal-line",
    dot: "bg-seminal",
  },
  POSSIBLE_IMPACT: {
    label: "Possible impact",
    short: "Possible impact",
    meaning:
      "A lexical match only — an alias and the old value co-occur. Never patched automatically.",
    icon: AlertTriangle,
    text: "text-warn",
    bg: "bg-warn-bg",
    border: "border-warn-line",
    dot: "bg-warn",
  },
  CURRENT: {
    label: "Current",
    short: "Current",
    meaning: "The claim already matches the new legal position. No action needed.",
    icon: CheckCircle2,
    text: "text-good",
    bg: "bg-good-bg",
    border: "border-good-line",
    dot: "bg-good",
  },
};

export const TIER_LABEL: Record<EvidenceTier, string> = {
  STRUCTURED: "Structured match",
  LEXICAL: "Lexical match",
};

export const WORKFLOW_LABEL: Record<WorkflowState, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted for approval",
  RESOLVED: "Resolved",
};

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  ESCALATED: "Escalated to counsel",
};

export const REJECTION_REASONS = [
  { value: "POLICY_EXCEEDS", label: "Firm policy deliberately exceeds the law" },
  { value: "NOT_APPLICABLE", label: "Not applicable to this artefact" },
  { value: "WRONG_MATCH", label: "Incorrect match" },
  { value: "NEEDS_COUNSEL", label: "Needs counsel" },
  { value: "OTHER", label: "Other" },
] as const;

/** Severity ordering for the queue: most urgent first. */
export const STATUS_ORDER: Record<SystemStatus, number> = {
  UPDATE_NEEDED: 3,
  LEGAL_REVIEW_REQUIRED: 2,
  POSSIBLE_IMPACT: 1,
  CURRENT: 0,
};
