import type { ImpactDetail } from "../api/types";

// Offsets are UTF-16 indices into the version's raw_text, produced at ingest.
// We slice by those offsets rather than searching for the quote: the same
// sentence can appear more than once, and a search would highlight the wrong one.
function useWindow(raw: string, start: number, end: number, pad = 260) {
  const from = Math.max(0, start - pad);
  const to = Math.min(raw.length, end + pad);
  return {
    before: raw.slice(from, start),
    match: raw.slice(start, end),
    after: raw.slice(end, to),
    truncatedStart: from > 0,
    truncatedEnd: to < raw.length,
  };
}

/** Renders the internal evidence with the matched span highlighted in place. */
export function InternalEvidence({ impact }: { impact: ImpactDetail }) {
  const { evidence, evidence_raw_text: raw } = impact;
  const w = useWindow(raw, evidence.start, evidence.end);

  // Within the highlighted span, mark the exact characters the patch replaces.
  const patch = impact.proposed_patch;
  const inSpan =
    patch && patch.start >= evidence.start && patch.end <= evidence.end
      ? {
          lead: raw.slice(evidence.start, patch.start),
          value: raw.slice(patch.start, patch.end),
          tail: raw.slice(patch.end, evidence.end),
        }
      : null;

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-wide text-ink-faint">
          {impact.name} · {evidence.locator}
        </span>
        <span className="font-mono text-[11px] text-ink-faint">
          chars {evidence.start}–{evidence.end}
        </span>
      </div>
      <p className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink-soft">
        {w.truncatedStart && <span className="text-ink-faint">…</span>}
        {w.before}
        <mark className="rounded bg-warn-bg px-0.5 text-ink decoration-warn-line">
          {inSpan ? (
            <>
              {inSpan.lead}
              <span className="rounded bg-bad-bg px-0.5 font-semibold text-bad">{inSpan.value}</span>
              {inSpan.tail}
            </>
          ) : (
            w.match
          )}
        </mark>
        {w.after}
        {w.truncatedEnd && <span className="text-ink-faint">…</span>}
      </p>
    </div>
  );
}

/** Renders the regulator's own words for the change, as supplied by the provider. */
export function RegulatoryEvidence({ impact }: { impact: ImpactDetail }) {
  const { change, regulatory_update: update } = impact;
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-wide text-ink-faint">
          {update.provider_ref}
        </span>
        <span className="font-mono text-[11px] text-ink-faint">
          effective {update.effective_date?.slice(0, 10)}
        </span>
      </div>
      <p className="font-serif text-[15px] leading-relaxed text-ink-soft">
        <mark className="rounded bg-good-bg px-0.5 text-ink">{change.source_span}</mark>
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
        <span className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono">
          {change.concept}
        </span>
        <span className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono">
          {change.change_type}
        </span>
        {change.old_value != null && (
          <span className="font-mono">
            {change.old_value} → <strong className="text-ink">{change.new_value}</strong> {change.unit}
          </span>
        )}
        {update.source_url && (
          <a
            href={update.source_url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-ink"
          >
            source
          </a>
        )}
      </div>
    </div>
  );
}
