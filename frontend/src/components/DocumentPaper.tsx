import { ChevronDown, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { ImpactDetail, User } from "../api/types";
import { getBlastRadiusForChange, getCategoryBreakdown } from "../lib/legalGraph";
import { AUTHORITY_ICON, AUTHORITY_TYPE_LABEL, STATUS_CONFIG } from "../statusConfig";
import type { Clause, FirmDocument } from "../types";
import Redline from "./Redline";
import ReviewPanel from "./ReviewPanel";

interface Props {
  doc: FirmDocument;
  documents: FirmDocument[];
  user: User | null;
  impactIdFor: (clauseId: string) => string | null;
  reload: () => void;
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

function PaperClause({
  clause,
  documents,
  user,
  impactIdFor,
  reload,
}: {
  clause: Clause;
  documents: FirmDocument[];
  user: User | null;
  impactIdFor: (clauseId: string) => string | null;
  reload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const change = clause.change;
  const cfg = STATUS_CONFIG[clause.status];
  const { number, title } = parseHeading(clause.heading);
  const AuthorityIcon = change ? AUTHORITY_ICON[change.authorityType] : null;

  const blastRadius = change ? getBlastRadiusForChange(change, documents, clause.documentId) : [];
  // One entry per matching clause, so a document with several affected clauses
  // appears several times. The list names documents, so collapse to unique ones.
  const affectedDocs = [...new Map(blastRadius.map((b) => [b.document.id, b.document])).values()];
  const categoryBreakdown = getCategoryBreakdown(affectedDocs);
  const categoryText = Object.entries(categoryBreakdown)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? "s" : ""}`)
    .join(" · ");

  // The redline above is derived from a flattened snapshot of the finding;
  // the actual edit/submit/approve/reject/escalate workflow needs the real
  // ImpactDetail (revision, workflow_state, audit) from the backend, fetched
  // only once the reviewer actually opens this clause.
  const impactId = change ? impactIdFor(clause.id) : null;
  const [detail, setDetail] = useState<ImpactDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function loadDetail() {
    if (!impactId) return;
    try {
      setDetail(await api.impact(impactId));
      setDetailError(null);
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Could not load this finding");
    }
  }

  useEffect(() => {
    if (open && impactId && !detail && !detailError) loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, impactId]);

  return (
    <div className={change ? `border-l-2 ${cfg.border} -ml-4 pl-[14px]` : ""}>
      <p className="text-justify text-[16px] leading-[1.9] text-ink">
        {number && (
          <span className="font-semibold">
            {number}. {title}.{" "}
          </span>
        )}
        {clause.status === "change" && change?.redline ? (
          <Redline segments={change.redline} approved={change.approved} />
        ) : (
          clause.text
        )}
      </p>

      {change && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-sans text-[11px]">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${
              clause.status === "change"
                ? change.approved
                  ? "border-good-line bg-good-bg text-good"
                  : "border-bad-line bg-bad-bg text-bad"
                : `${cfg.bg} ${cfg.border} ${cfg.text}`
            }`}
          >
            {clause.status === "change" ? (change.approved ? "Approved" : "Pending approval") : cfg.short}
          </span>
          <span className="inline-flex items-center gap-1 text-ink-faint italic">
            {AuthorityIcon && <AuthorityIcon size={11} />}
            Authority: {change.authority}
          </span>
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

      {change && open && (
        <div className="mt-2.5 rounded-xl border border-line bg-surface-2 p-4 font-sans shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}>
              <cfg.icon size={12} /> {cfg.label} · {AUTHORITY_TYPE_LABEL[change.authorityType]}
            </span>
            <span className="font-mono text-xs text-ink-faint">{change.date}</span>
          </div>
          <p className="mt-2.5 text-sm font-semibold leading-snug text-ink">{change.summary}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{change.detail}</p>
          <div className="mt-3.5 rounded-lg bg-surface p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <GitBranch size={12} />
              Blast radius: {affectedDocs.length} document{affectedDocs.length !== 1 ? "s" : ""} affected
              {categoryText && <span className="font-normal text-ink-soft"> — {categoryText}</span>}
            </p>
            {affectedDocs.length > 0 && (
              <ul className="mt-2 space-y-1">
                {affectedDocs.map((d) => (
                  <li key={d.id} className="text-[13px] text-ink-soft">
                    <span className="font-medium text-ink">{d.title}</span>{" "}
                    <span className="text-ink-faint">({d.type})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {impactId && (
            <div className="mt-3.5">
              {detailError && (
                <p className="rounded-lg border border-bad-line bg-bad-bg p-2.5 text-xs text-bad">{detailError}</p>
              )}
              {!detail && !detailError && (
                <p className="text-xs text-ink-faint">Loading review details…</p>
              )}
              {detail && (
                <ReviewPanel
                  impact={detail}
                  user={user}
                  onChanged={() => {
                    loadDetail();
                    reload();
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocumentPaper({ doc, documents, user, impactIdFor, reload }: Props) {
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
    <div className="mx-auto max-w-[880px] rounded-lg border border-line bg-surface px-10 py-10 font-serif shadow-sm sm:px-14">
      <div className="border-b border-line-soft pb-6 text-center">
        <p className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-faint">{doc.citation}</p>
        <h2 className="mt-3 break-words text-xl font-semibold uppercase tracking-wide text-ink">{mainTitle}</h2>
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
            user={user}
            impactIdFor={impactIdFor}
            reload={reload}
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
