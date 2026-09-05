import {
  Bot,
  BookOpen,
  CheckCircle2,
  Copy,
  FilePenLine,
  FileSignature,
  FileText,
  Gavel,
  GraduationCap,
  ListChecks,
  Megaphone,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { AuthorityType, ChangeStatus, FirmDocType } from "./types";

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
    text: "text-ink",
    bg: "bg-surface-2",
    border: "border-ink/20",
    dot: "bg-ink",
  },
  change: {
    label: "Change",
    short: "Change",
    icon: FilePenLine,
    text: "text-brand",
    bg: "bg-brand-soft",
    border: "border-brand/30",
    dot: "bg-brand",
  },
};

export const AUTHORITY_TYPE_LABEL: Record<AuthorityType, string> = {
  statute: "Statute",
  case: "Case law",
  guidance: "Regulatory guidance",
};

export const AUTHORITY_ICON: Record<AuthorityType, LucideIcon> = {
  statute: BookOpen,
  case: Gavel,
  guidance: FileText,
};

export const DOC_TYPE_ICON: Record<FirmDocType, LucideIcon> = {
  Contract: FileSignature,
  "Template Clause": Copy,
  Checklist: ListChecks,
  Workflow: Workflow,
  Playbook: BookOpen,
  "Client Advisory": Megaphone,
  "Training Material": GraduationCap,
  "Automated Compliance Tool": Bot,
};

// The blast radius graph groups document types into two families: signed
// instruments and reusable precedent on one side, everything advisory or
// internal-process on the other — mirrors how a lawyer actually triages a
// blast radius (what needs a redline vs. what just needs a heads-up).
export type DocTypeGroup = "contract" | "advisory";

export const DOC_TYPE_GROUP: Record<FirmDocType, DocTypeGroup> = {
  Contract: "contract",
  "Template Clause": "contract",
  Checklist: "advisory",
  Workflow: "advisory",
  Playbook: "advisory",
  "Client Advisory": "advisory",
  "Training Material": "advisory",
  "Automated Compliance Tool": "advisory",
};

export const DOC_TYPE_GROUP_CONFIG: Record<DocTypeGroup, { label: string; text: string; bg: string; border: string }> = {
  contract: {
    label: "Contract / Precedent",
    text: "text-brand",
    bg: "fill-brand-soft",
    border: "stroke-brand",
  },
  advisory: {
    label: "Internal / Advisory",
    text: "text-seminal",
    bg: "fill-seminal-bg",
    border: "stroke-seminal",
  },
};
