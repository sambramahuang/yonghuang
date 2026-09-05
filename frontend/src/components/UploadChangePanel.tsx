import { CheckCircle2, FileUp, GitBranch, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import {
  findDocumentsByAuthority,
  getAllAuthorities,
  getCategoryBreakdown,
  ingestChange,
  type IngestResult,
} from "../lib/legalGraph";
import { AUTHORITY_TYPE_LABEL, STATUS_CONFIG } from "../statusConfig";
import type { AuthorityType, ChangeStatus, FirmDocument } from "../types";
import StatusBadge from "./StatusBadge";

interface Props {
  documents: FirmDocument[];
  onIngested: (result: IngestResult) => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const FIELD =
  "mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-ink-faint/20";
const LABEL = "text-xs font-semibold text-ink-soft";

export default function UploadChangePanel({ documents, onIngested }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [status, setStatus] = useState<Extract<ChangeStatus, "change" | "uncertain">>("change");
  const [authority, setAuthority] = useState("");
  const [authorityType, setAuthorityType] = useState<AuthorityType>("case");
  const [originDocumentId, setOriginDocumentId] = useState("");
  const [originClauseId, setOriginClauseId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [redlineBefore, setRedlineBefore] = useState("");
  const [redlineAfter, setRedlineAfter] = useState("");

  const [result, setResult] = useState<IngestResult | null>(null);

  const originDoc = documents.find((d) => d.id === originDocumentId) ?? null;
  const knownAuthorities = useMemo(() => getAllAuthorities(documents), [documents]);

  const relatedDocs = useMemo(
    () => findDocumentsByAuthority(documents, authority, originDocumentId),
    [documents, authority, originDocumentId],
  );
  const breakdown = getCategoryBreakdown(relatedDocs);
  const breakdownText = Object.entries(breakdown)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? "s" : ""}`)
    .join(" · ");

  const canIngest =
    originDocumentId !== "" &&
    originClauseId !== "" &&
    authority.trim().length > 0 &&
    summary.trim().length > 0;

  function handleIngest() {
    const res = ingestChange(documents, {
      originDocumentId,
      originClauseId,
      status,
      authority: authority.trim(),
      authorityType,
      date,
      summary,
      detail,
      redlineBefore,
      redlineAfter,
    });
    setResult(res);
    onIngested(res);
  }

  function reset() {
    setFile(null);
    setStatus("change");
    setAuthority("");
    setAuthorityType("case");
    setOriginDocumentId("");
    setOriginClauseId("");
    setDate(todayISO());
    setSummary("");
    setDetail("");
    setRedlineBefore("");
    setRedlineAfter("");
    setResult(null);
  }

  if (result) {
    const cfg = STATUS_CONFIG[result.newStatus];
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface p-12 text-center shadow-md">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border ${cfg.bg} ${cfg.border}`}>
          <CheckCircle2 size={26} className={cfg.text} />
        </div>
        <h2 className="mt-5 font-serif text-2xl font-medium text-ink">Change ingested</h2>
        <p className="mx-auto mt-3.5 max-w-sm text-sm leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">{result.clauseHeading}</span> in{" "}
          <span className="font-semibold text-ink">{result.originTitle}</span> is now marked
        </p>
        <div className="mt-3.5 flex justify-center">
          <StatusBadge status={result.newStatus} />
        </div>
        <p className="mt-6 inline-flex items-center gap-1.5 text-sm text-ink-soft">
          <GitBranch size={14} />
          {result.affectedCount} document{result.affectedCount !== 1 ? "s" : ""} already cite this
          authority and are flagged automatically — no manual edits required.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2"
          >
            Upload another change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-medium text-ink">Upload a change</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Log an amendment, a court decision, or revised guidance once, against the tool, system,
          or practice it directly amends. Every other document already citing the same authority
          is flagged automatically — no manual cross-referencing required.
        </p>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          setFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition ${
          dragOver ? "border-accent bg-surface-2" : "border-line bg-surface"
        }`}
      >
        <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? (
          <>
            <FileUp size={22} className="text-ink-soft" />
            <p className="mt-2.5 text-sm font-medium text-ink">{file.name}</p>
            <p className="mt-0.5 text-xs text-ink-faint">Attached — click to replace</p>
          </>
        ) : (
          <>
            <UploadCloud size={22} className="text-ink-faint" />
            <p className="mt-2.5 text-sm font-medium text-ink">
              Drop the gazette notice, judgment, or circular here
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">or click to browse (optional — you can also just fill in the fields below)</p>
          </>
        )}
      </label>

      <div className="space-y-4 rounded-2xl border border-line bg-surface p-7 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={FIELD}>
              <option value="change">Change — the required edit is known</option>
              <option value="uncertain">Uncertain — outcome still pending</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Effective / decision date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <div>
            <label className={LABEL}>Authority — the statute or case law</label>
            <input
              type="text"
              list="known-authorities"
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
              placeholder="e.g. Court of Appeal in X v Y [2026] SGCA 12, or PDPA s.14 (proposed amendment)"
              className={FIELD}
            />
            <datalist id="known-authorities">
              {knownAuthorities.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={LABEL}>Authority type</label>
            <select
              value={authorityType}
              onChange={(e) => setAuthorityType(e.target.value as AuthorityType)}
              className={FIELD}
            >
              {(Object.keys(AUTHORITY_TYPE_LABEL) as AuthorityType[]).map((t) => (
                <option key={t} value={t}>
                  {AUTHORITY_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Document this change amends</label>
            <select
              value={originDocumentId}
              onChange={(e) => {
                setOriginDocumentId(e.target.value);
                setOriginClauseId("");
              }}
              className={FIELD}
            >
              <option value="">Select a document…</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Clause / provision affected</label>
            <select
              value={originClauseId}
              onChange={(e) => setOriginClauseId(e.target.value)}
              disabled={!originDoc}
              className={`${FIELD} disabled:bg-surface-2 disabled:text-ink-faint`}
            >
              <option value="">Select a clause…</option>
              {originDoc?.clauses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.heading}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL}>What changed (one line)</label>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="e.g. Deemed consent no longer covers AI training data"
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL}>Detail</label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder="Explain the change in enough detail that someone reading it later understands exactly what it requires and why."
            className={FIELD}
          />
        </div>

        {status === "change" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Text being removed (optional)</label>
              <textarea
                value={redlineBefore}
                onChange={(e) => setRedlineBefore(e.target.value)}
                rows={3}
                placeholder="Paste the exact wording to strike out…"
                className={`${FIELD} font-mono text-xs`}
              />
            </div>
            <div>
              <label className={LABEL}>Text being inserted (optional)</label>
              <textarea
                value={redlineAfter}
                onChange={(e) => setRedlineAfter(e.target.value)}
                rows={3}
                placeholder="Paste the replacement wording…"
                className={`${FIELD} font-mono text-xs`}
              />
            </div>
          </div>
        )}
      </div>

      {authority.trim().length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-7 shadow-sm">
          <div className="flex items-center gap-1.5">
            <GitBranch size={16} className="text-ink" />
            <h3 className="text-sm font-semibold text-ink">
              Documents already citing this authority ({relatedDocs.length})
            </h3>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
            Computed automatically from exact authority citations — no keyword guessing. These
            will be flagged as this change's blast radius the moment it's ingested.
            {breakdownText && <> Breakdown: {breakdownText}.</>}
          </p>

          {relatedDocs.length === 0 ? (
            <p className="mt-3 text-sm text-ink-faint">
              No other document currently cites this authority — this will be the first.
            </p>
          ) : (
            <ul className="mt-3.5 space-y-2">
              {relatedDocs.map((d) => (
                <li key={d.id} className="flex items-start gap-3 rounded-xl border border-line-soft p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{d.title}</p>
                    <p className="font-mono text-xs text-ink-soft">{d.citation}</p>
                    <p className="mt-0.5 text-xs italic text-ink-faint">
                      {d.type} · {d.client}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleIngest}
          disabled={!canIngest}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ingest change
        </button>
      </div>
    </div>
  );
}
