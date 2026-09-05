import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { SYSTEM_STATUS, TIER_LABEL } from "../api/statusConfig";
import type { ImpactDetail, User } from "../api/types";
import { InternalEvidence, RegulatoryEvidence } from "./EvidencePanel";
import ImpactBadge from "./ImpactBadge";
import ReviewPanel from "./ReviewPanel";

interface Props {
  impactId: string;
  user: User | null;
  onChanged: () => void;
}

/** Explains, from the stored rule, why the engine refused to propose a patch. */
function boundaryReasons(impact: ImpactDetail): string[] {
  const r = impact.rule;
  const reasons: string[] = [];
  if (impact.change.change_type !== "VALUE_CHANGED")
    reasons.push(`the change is ${impact.change.change_type}, not a value change`);
  if (!r) return reasons;
  if (r.has_qualifier) reasons.push("the sentence carries a qualifier (unless / except / subject to)");
  if (r.assertion_type === "STATES_BOTH") reasons.push("law and policy are entangled in one sentence");
  if (r.temporal_frame !== "PRESENT") reasons.push(`the statement is ${r.temporal_frame.toLowerCase()}`);
  if (r.extraction_confidence === "LOW") reasons.push("extraction confidence is low");
  if (r.applies_to_condition) reasons.push(`it states a condition we do not parse: "${r.applies_to_condition}"`);
  if (r.modality !== "IS") reasons.push(`modality is ${r.modality}, not a plain statement`);
  if (r.operator && r.operator !== "=") reasons.push(`the comparator is ${r.operator}, not equality`);
  return reasons;
}

export default function ImpactDetailView({ impactId, user, onChanged }: Props) {
  const [impact, setImpact] = useState<ImpactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .impact(impactId)
      .then((d) => {
        setImpact(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load finding"));

  useEffect(() => {
    let live = true;
    api
      .impact(impactId)
      .then((d) => live && (setImpact(d), setError(null)))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : "Failed to load finding"));
    return () => {
      live = false;
    };
  }, [impactId]);

  if (error) return <p className="rounded-lg border border-bad-line bg-bad-bg p-3 text-sm text-bad">{error}</p>;
  if (!impact) return <p className="p-3 text-sm text-ink-faint">Loading…</p>;

  const cfg = SYSTEM_STATUS[impact.system_status];
  const reasons = boundaryReasons(impact);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-lg text-ink">{impact.name}</h2>
          <ImpactBadge status={impact.system_status} />
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">{impact.explanation}</p>
        <p className="mt-2 font-mono text-[11px] tracking-wide text-ink-faint">
          {TIER_LABEL[impact.evidence_tier]} · {impact.evidence.locator} · finding #{impact.id}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <section>
          <h3 className="mb-2 font-mono text-[11px] tracking-wide text-ink-faint">
            WHAT THE FIRM'S DOCUMENT SAYS
          </h3>
          <InternalEvidence impact={impact} />
        </section>

        <section>
          <h3 className="mb-2 font-mono text-[11px] tracking-wide text-ink-faint">
            WHAT THE REGULATOR CHANGED
          </h3>
          <RegulatoryEvidence impact={impact} />
        </section>

        {reasons.length > 0 && (
          <section>
            <h3 className="mb-2 font-mono text-[11px] tracking-wide text-ink-faint">
              WHY NO PATCH WAS PROPOSED
            </h3>
            <div className={`rounded-lg border p-3.5 ${cfg.bg} ${cfg.border}`}>
              <p className="text-sm text-ink-soft">
                The competence boundary stopped here because {reasons.join("; ")}.
              </p>
              <p className="mt-1.5 text-xs text-ink-faint">
                This is executable code, not a model instruction — see backend/src/impact/boundary.js.
              </p>
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 font-mono text-[11px] tracking-wide text-ink-faint">REVIEW</h3>
          <ReviewPanel
            impact={impact}
            user={user}
            onChanged={() => {
              void load();
              onChanged();
            }}
          />
        </section>

        {impact.audit.length > 0 && (
          <section>
            <h3 className="mb-2 font-mono text-[11px] tracking-wide text-ink-faint">AUDIT TRAIL</h3>
            <ol className="space-y-1.5">
              {impact.audit.map((e) => (
                <li key={e.id} className="flex items-baseline gap-2 text-sm">
                  <span className="font-mono text-[11px] text-ink-faint">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                  <span className="text-ink">{e.action}</span>
                  <span className="text-ink-faint">by {e.actor_name}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
