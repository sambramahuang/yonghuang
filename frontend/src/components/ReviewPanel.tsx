import { useState } from "react";
import { api, ApiError } from "../api/client";
import { REJECTION_REASONS, RESOLUTION_LABEL, WORKFLOW_LABEL } from "../api/statusConfig";
import type { ImpactDetail, RejectionReason, User } from "../api/types";

interface Props {
  impact: ImpactDetail;
  user: User | null;
  onChanged: () => void;
}

/**
 * The approval workflow: edit the redline, submit, then a *different* person
 * approves. Nothing here writes a new version directly — approval is the only
 * path, and the backend enforces the separation of duties independently.
 */
export default function ReviewPanel({ impact, user, onChanged }: Props) {
  const patch = impact.proposed_patch;
  const [reason, setReason] = useState<RejectionReason>("POLICY_EXCEEDS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The editor resets whenever the server hands us a different revision of the
  // finding. Deriving it during render (rather than syncing in an effect) means
  // a saved edit or a concurrent change can never leave a stale value on screen.
  const identity = `${impact.id}:${impact.revision}`;
  const [edit, setEdit] = useState({ identity, value: patch?.new ?? "" });
  const draft = edit.identity === identity ? edit.value : (patch?.new ?? "");
  const setDraft = (value: string) => setEdit({ identity, value });

  const isApprover = user?.capability === "APPROVER";
  const resolved = impact.workflow_state === "RESOLVED";

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      // A 409 means someone else moved the finding; the reload shows the truth.
      setError(e instanceof ApiError ? e.message : "Something went wrong");
      if (e instanceof ApiError && e.status === 409) onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (resolved) {
    return (
      <div className="rounded-lg border border-line bg-surface-2 p-3.5 text-sm">
        <p className="text-ink">
          <strong>{RESOLUTION_LABEL[impact.resolution!]}</strong>
          {impact.rejection_reason && impact.resolution !== "ACCEPTED" && (
            <span className="text-ink-faint"> · {impact.rejection_reason}</span>
          )}
        </p>
        {impact.resolving_version_id && (
          <p className="mt-1 text-ink-faint">
            Wrote a new version of {impact.name}. The finding is closed.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-ink-faint">
        <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono">
          {WORKFLOW_LABEL[impact.workflow_state]}
        </span>
        <span className="font-mono">rev {impact.revision}</span>
      </div>

      {patch ? (
        <div className="rounded-lg border border-line bg-surface p-3.5">
          <p className="mb-2 font-mono text-[11px] tracking-wide text-ink-faint">PROPOSED REDLINE</p>
          <div className="flex flex-wrap items-center gap-2 font-serif text-[15px]">
            <span className="rounded bg-bad-bg px-1.5 py-0.5 text-bad line-through">{patch.old}</span>
            <span className="text-ink-faint">→</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              inputMode="decimal"
              aria-label="Replacement value"
              className="w-24 rounded border border-good-line bg-good-bg px-1.5 py-0.5 font-semibold text-good outline-none focus:ring-2 focus:ring-good-line disabled:opacity-60"
            />
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            A patch is a literal replacement over characters {patch.start}–{patch.end}. The system
            never generates prose.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || draft === patch.new || !draft}
              onClick={() => run(() => api.editPatch(impact.id, impact.revision, draft))}
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-40"
            >
              Save edit
            </button>
            {impact.workflow_state === "DRAFT" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => api.submit(impact.id, impact.revision))}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-40"
              >
                Submit for approval
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-line p-3 text-sm text-ink-faint">
          No patch is offered for this finding. {impact.explanation}
        </p>
      )}

      <div className="rounded-lg border border-line bg-surface p-3.5">
        <p className="mb-2 font-mono text-[11px] tracking-wide text-ink-faint">DECISION</p>
        {!isApprover && (
          <p className="mb-2 text-xs text-ink-faint">
            Approval requires the APPROVER capability. Switch role to act on this.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !isApprover || impact.workflow_state !== "SUBMITTED" || !patch}
            title={
              !patch
                ? "Only a proposed patch can be approved"
                : impact.workflow_state !== "SUBMITTED"
                  ? "The finding must be submitted first"
                  : undefined
            }
            onClick={() => run(() => api.approve(impact.id, impact.revision))}
            className="rounded-lg bg-good px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-40"
          >
            Approve
          </button>
          <select
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value as RejectionReason)}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink"
          >
            {REJECTION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !isApprover}
            onClick={() => run(() => api.reject(impact.id, impact.revision, reason))}
            className="rounded-lg border border-bad-line bg-bad-bg px-3 py-1.5 text-sm font-medium text-bad hover:opacity-90 disabled:opacity-40"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => api.escalate(impact.id, impact.revision))}
            className="rounded-lg border border-seminal-line bg-seminal-bg px-3 py-1.5 text-sm font-medium text-seminal hover:opacity-90 disabled:opacity-40"
          >
            Escalate to counsel
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-bad-line bg-bad-bg p-2.5 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
