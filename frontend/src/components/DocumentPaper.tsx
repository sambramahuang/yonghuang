import { AlertTriangle, Check, ChevronDown, GitBranch, Pencil, Send, X } from "lucide-react";
import { useState } from "react";
import { REJECTION_REASONS } from "../api/statusConfig";
import type { RejectionReason } from "../api/types";
import { getBlastRadiusForChange, getCategoryBreakdown } from "../lib/legalGraph";
import { AUTHORITY_ICON, AUTHORITY_TYPE_LABEL, STATUS_CONFIG } from "../statusConfig";
import type { Clause, FirmDocument } from "../types";
import Redline from "./Redline";

export type ResolveAction = "accept" | "reject" | "submit" | "edit";

interface Props {
  doc: FirmDocument;
  documents: FirmDocument[];
  canApprove: boolean;
  canSubmit: boolean;
  busyClauseId: string | null;
  onResolve: (clauseId: string, action: ResolveAction, reason?: RejectionReason, text?: string) => void;
  /** Reviewer-only document-wide edit session — see DocumentViewer. */
  editMode?: boolean;
  drafts?: Record<string, string>;
  onDraftChange?: (clauseId: string, text: string) => void;
}

// Real-world counterparty framing for the contract documents in the demo
// corpus — cosmetic only, not part of the domain model. Documents that
// aren't contracts simply have no entry here, so the parties preamble and
// signature block below never render for them.
const CONTRACT_META: Record<string, { counterparty: string; clientLabel: string; counterpartyLabel: string }> = {
  "doc-msa-straits": { counterparty: "Nimbus AI Pte Ltd", clientLabel: "Client", counterpartyLabel: "Vendor" },
  "doc-dpa-apex": { counterparty: "Nimbus AI Pte Ltd", clientLabel: "Client", counterpartyLabel: "Processor" },
  "doc-employment-northbridge": { counterparty: "[Employee Name]", clientLabel: "Employer", counterpartyLabel: "Employee" },
};

// Clause headings across the corpus all follow "<Label> <Number> — <Title>"
// — "Clause 1 —", "Step 4 —", "§2 —", "Module 3 —", "Rule 1 —", etc. — so a
// single split on the em dash numbers every document type the same way.
function parseHeading(heading: string): { number: string; title: string } {
  const idx = heading.indexOf("—");
  if (idx === -1) return { number: "", title: heading };
  return { number: heading.slice(0, idx).trim(), title: heading.slice(idx + 1).trim() };
}

// The label and colours of the little chip that sits under a flagged clause.
// A resolved clause reads as settled — it says what the reviewer decided, not
// what the machine originally found.
function decisionChip(clause: Clause): { label: string; className: string } {
  const cfg = STATUS_CONFIG[clause.status];
  switch (clause.change?.resolution) {
    case "accepted":
      return { label: "Accepted", className: "border-good-line bg-good-bg text-good" };
    case "rejected":
      return { label: "Rejected — no change made", className: "border-line bg-surface-2 text-ink-soft" };
    case "escalated":
      return { label: "Escalated to counsel", className: "border-seminal-line bg-seminal-bg text-seminal" };
    default:
      return clause.status === "change"
        ? { label: "Pending decision", className: "border-bad-line bg-bad-bg text-bad" }
        : { label: cfg.short, className: `${cfg.bg} ${cfg.border} ${cfg.text}` };
  }
}

function PaperClause({
  clause,
  documents,
  canApprove,
  canSubmit,
  busy,
  onResolve,
  editMode = false,
  draftValue,
  onDraftChange,
}: {
  clause: Clause;
  documents: FirmDocument[];
  canApprove: boolean;
  canSubmit: boolean;
  busy: boolean;
  onResolve: (clauseId: string, action: ResolveAction, reason?: RejectionReason, text?: string) => void;
  editMode?: boolean;
  draftValue?: string;
  onDraftChange?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [editingLocal, setEditingLocal] = useState(false);
  const [reason, setReason] = useState<RejectionReason>("NOT_APPLICABLE");
  const change = clause.change;
  const draftText = draftValue ?? change?.patchText ?? "";
  const cfg = STATUS_CONFIG[clause.status];
  const { number, title } = parseHeading(clause.heading);
  const AuthorityIcon = change ? AUTHORITY_ICON[change.authorityType] : null;
  const chip = decisionChip(clause);
  // Both flagged categories are decidable: a proposed edit is accepted or
  // rejected, and a flag with nothing to apply is confirmed as read or dismissed.
  const unresolved = !!change && !change.resolution && clause.status === "change";
  const decidable = unresolved && canApprove;
  // A drafted edit still needs submitting before it can be approved, but an
  // approver need not wait for someone else to do it: accepting submits and
  // approves in one step.
  const needsSubmission = unresolved && change?.awaitingSubmission === true;
  const submittable = needsSubmission && canSubmit;
  // Anyone who can act on this clause may rewrite the machine's draft first, so
  // a bad first draft is never the final word.
  const editable = unresolved && change?.hasPatch && (canSubmit || canApprove);
  // In a reviewer's document-wide edit session, every clause they could type
  // into opens immediately — no separate "Edit" click to discover it first.
  const forceOpen = editMode && editable && canSubmit;
  const editing = editingLocal || forceOpen;
  // Flagged for review but with nothing drafted to type into (POSSIBLE_IMPACT,
  // or a legal-review finding the drafter declined) — surfaced distinctly so a
  // reviewer walking the document in edit mode doesn't read past it.
  const flaggedNoDraft = editMode && unresolved && !change?.hasPatch && canSubmit;

  const blastRadius = change ? getBlastRadiusForChange(change, documents, clause.documentId) : [];
  const categoryBreakdown = getCategoryBreakdown(blastRadius.map((b) => b.document));
  const categoryText = Object.entries(categoryBreakdown)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? "s" : ""}`)
    .join(" · ");

  return (
    <div className={change ? `border-l-2 ${cfg.border} -ml-4 pl-[14px]` : ""}>
      <p className="text-justify text-[14.5px] leading-[1.85] text-ink">
        {number && (
          <span className="font-semibold">
            {number}. {title}.{" "}
          </span>
        )}
        {change?.redline ? (
          <Redline segments={change.redline} approved={change.approved} />
        ) : (
          clause.text
        )}
      </p>

      {change && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-sans text-[11px]">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${chip.className}`}>
            {chip.label}
          </span>
          <span className="inline-flex items-center gap-1 text-ink-faint italic">
            {AuthorityIcon && <AuthorityIcon size={11} />}
            Authorit{change.authorities.length > 1 ? "ies" : "y"}: {change.authorities.join("; ")}
          </span>
          {decidable && !rejecting && !editing && (
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy}
                title={
                  needsSubmission
                    ? "Accepting submits this edit and approves it in one step"
                    : undefined
                }
                onClick={() => onResolve(clause.id, "accept")}
                className="inline-flex items-center gap-1 rounded-md border border-good-line bg-good-bg px-1.5 py-0.5 font-semibold text-good transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={10} /> {busy ? "Working…" : "Accept"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejecting(true)}
                className="inline-flex items-center gap-1 rounded-md border border-bad-line bg-bad-bg px-1.5 py-0.5 font-semibold text-bad transition hover:opacity-80 disabled:opacity-40"
              >
                <X size={10} /> Reject
              </button>

            </span>
          )}
          {editable && !rejecting && !editing && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditingLocal(true)}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-semibold text-ink transition hover:opacity-80 disabled:opacity-40"
            >
              <Pencil size={10} /> Edit
            </button>
          )}
          {submittable && !editing && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolve(clause.id, "submit")}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-semibold text-ink transition hover:opacity-80 disabled:opacity-40"
            >
              <Send size={10} /> {busy ? "Working…" : "Submit for approval"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`inline-flex items-center gap-1 font-semibold ${cfg.text}`}
          >
            What changed
            <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      )}

      {/* Rejecting is recorded against a reason — the API requires one, and the
          audit trail is the point of the workflow, so it is asked for here
          rather than filled in silently. */}
      {decidable && rejecting && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-bad-line bg-bad-bg/40 px-3 py-2 font-sans text-[11px]">
          <label className="font-semibold text-ink" htmlFor={`reason-${clause.id}`}>
            Reason for rejecting
          </label>
          <select
            id={`reason-${clause.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value as RejectionReason)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink focus:outline-none focus:ring-1 focus:ring-ink-faint/30"
          >
            {REJECTION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setRejecting(false);
              onResolve(clause.id, "reject", reason);
            }}
            className="rounded-md border border-bad-line bg-bad px-2 py-1 font-semibold text-paper hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Working…" : "Confirm rejection"}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="rounded-md border border-line px-2 py-1 font-semibold text-ink-soft hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      )}

      {/* The machine's draft is a starting point, not a verdict — a reviewer
          or approver can rewrite it here before it is submitted or approved.
          Inside a document-wide edit session this box just stays open for
          typing; saving happens once, for the whole document, from there. */}
      {editable && editing && (
        <div className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2 font-sans text-[11px]">
          {!forceOpen && (
            <label className="mb-1 block font-semibold text-ink" htmlFor={`edit-${clause.id}`}>
              Edit proposed replacement
            </label>
          )}
          <textarea
            id={`edit-${clause.id}`}
            value={draftText}
            onChange={(e) => onDraftChange?.(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 font-serif text-[13px] text-ink outline-none focus:ring-1 focus:ring-ink-faint/30"
          />
          {!forceOpen && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={busy || !draftText.trim()}
                onClick={() => {
                  setEditingLocal(false);
                  onResolve(clause.id, "edit", undefined, draftText);
                }}
                className="rounded-md border border-line bg-ink px-2 py-1 font-semibold text-paper hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Working…" : "Save edit"}
              </button>
              <button
                type="button"
                onClick={() => setEditingLocal(false)}
                className="rounded-md border border-line px-2 py-1 font-semibold text-ink-soft hover:bg-surface-2"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Flagged for review but nothing was drafted to type into — surfaced so
          a reviewer walking the document in edit mode reads why, even though
          there's no text box here for them to act on directly. */}
      {flaggedNoDraft && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-seminal-line bg-seminal-bg/50 px-3 py-2 font-sans text-[11px]">
          <AlertTriangle size={12} className="shrink-0 text-seminal" />
          <span className="font-semibold text-seminal">Flagged for review — no proposed edit drafted.</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto font-semibold text-seminal underline decoration-dotted underline-offset-2"
          >
            Why?
          </button>
        </div>
      )}

      {change && open && (
        <div className="mt-2.5 rounded-xl border border-line bg-surface-2 p-4 font-sans shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}>
              <cfg.icon size={12} /> {cfg.label} · {AUTHORITY_TYPE_LABEL[change.authorityType]}
            </span>
            <span className="font-mono text-xs text-ink-faint">{change.date}</span>
          </div>
          {change.hasPatch && (
            // One status covers both kinds of edit, so the evidence behind this
            // one is named here: a reviewer must never approve drafted wording
            // believing a rule checked it.
            <p
              className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                change.verified
                  ? "border-good-line bg-good-bg text-good"
                  : "border-seminal-line bg-seminal-bg text-seminal"
              }`}
            >
              {change.verified
                ? "Verified edit — the old value was matched in the document"
                : "AI-drafted wording — read it before approving"}
            </p>
          )}
          <p className="mt-2.5 text-sm font-semibold leading-snug text-ink">{change.summary}</p>
          {change.detail !== change.summary && (
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{change.detail}</p>
          )}
          <div className="mt-3.5 rounded-lg bg-surface p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <GitBranch size={12} />
              Blast radius: {blastRadius.length} document{blastRadius.length !== 1 ? "s" : ""} affected
              {categoryText && <span className="font-normal text-ink-soft"> — {categoryText}</span>}
            </p>
            {blastRadius.length > 0 && (
              <ul className="mt-2 space-y-1">
                {blastRadius.map((b) => (
                  <li key={b.document.id} className="text-xs text-ink-soft">
                    <span className="font-medium text-ink">{b.document.title}</span>{" "}
                    <span className="text-ink-faint">({b.document.type})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentPaper({
  doc,
  documents,
  canApprove,
  canSubmit,
  busyClauseId,
  onResolve,
  editMode = false,
  drafts = {},
  onDraftChange,
}: Props) {
  const isContract = doc.type === "Contract";
  const meta = CONTRACT_META[doc.id];
  const isExecuted = isContract && doc.citation.toLowerCase().includes("executed");
  const mainTitle = isContract ? doc.title.replace(/\s+—\s+.+$/, "") : doc.title;
  const dateStr = new Date(doc.lastUpdated).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-[880px] rounded-lg border border-line bg-surface px-16 py-12 font-serif shadow-sm">
      <div className="border-b border-line-soft pb-6 text-center">
        <p className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-faint">{doc.citation}</p>
        <h2 className="mt-3 text-xl font-semibold uppercase tracking-wide text-ink">{mainTitle}</h2>
        {isContract && !isExecuted && meta && (
          <p className="mt-2 font-sans text-xs text-ink-faint">Template — prepared for {doc.client}</p>
        )}
      </div>

      {isExecuted && meta && (
        <p className="mt-8 text-justify text-[13.5px] leading-[1.9] text-ink-soft">
          This Agreement is made on {dateStr} between{" "}
          <strong className="text-ink">{doc.client}</strong> (the &ldquo;{meta.clientLabel}&rdquo;) and{" "}
          <strong className="text-ink">{meta.counterparty}</strong> (the &ldquo;{meta.counterpartyLabel}&rdquo;)
          (each a &ldquo;Party&rdquo; and together the &ldquo;Parties&rdquo;).
        </p>
      )}

      <div className="mt-8 space-y-5">
        {doc.clauses.map((clause) => (
          <PaperClause
            key={clause.id}
            clause={clause}
            documents={documents}
            canApprove={canApprove}
            canSubmit={canSubmit}
            busy={busyClauseId === clause.id}
            onResolve={onResolve}
            editMode={editMode}
            draftValue={drafts[clause.id]}
            onDraftChange={onDraftChange && ((text) => onDraftChange(clause.id, text))}
          />
        ))}
      </div>

      {isContract &&
        (isExecuted ? (
          <div className="mt-12 border-t border-line-soft pt-8 font-sans text-[13px] text-ink-soft">
            <p>IN WITNESS WHEREOF, the Parties have executed this Agreement as of the date first written above.</p>
            <div className="mt-8 grid grid-cols-2 gap-10">
              <div>
                <div className="h-10 border-b border-ink-faint" />
                <p className="mt-2 text-xs">
                  For and on behalf of
                  <br />
                  <strong className="text-ink">{doc.client}</strong>
                </p>
              </div>
              <div>
                <div className="h-10 border-b border-ink-faint" />
                <p className="mt-2 text-xs">
                  For and on behalf of
                  <br />
                  <strong className="text-ink">{meta?.counterparty}</strong>
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-12 border-t border-line-soft pt-6 font-sans text-xs italic text-ink-faint">
            This template requires party-specific details to be completed before execution.
          </p>
        ))}
    </div>
  );
}
