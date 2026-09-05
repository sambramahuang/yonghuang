import { CheckCircle2, FileUp, GitBranch, Search, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import {
  detectAffectedDocuments,
  ingestChange,
  type DetectedImpact,
  type IngestResult,
} from "../lib/legalGraph";
import { CHANGE_TYPE_LABEL, STATUS_CONFIG } from "../statusConfig";
import type { AffectedDocRef, ChangeType, LegalDocument } from "../types";
import StatusBadge from "./StatusBadge";

interface Props {
  documents: LegalDocument[];
  onIngested: (result: IngestResult) => void;
}

const CHANGE_TYPES: ChangeType[] = [
  "amendment",
  "regulatory_guidance",
  "judicial_reinterpretation",
  "overturned",
  "pending_appeal",
];

const todayISO = () => new Date().toISOString().slice(0, 10);

const FIELD =
  "mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-ink-faint/20";
const LABEL = "text-xs font-semibold text-ink-soft";

export default function UploadChangePanel({ documents, onIngested }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [changeType, setChangeType] = useState<ChangeType>("amendment");
  const [originDocumentId, setOriginDocumentId] = useState("");
  const [originClauseId, setOriginClauseId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [source, setSource] = useState("");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");

  const [detected, setDetected] = useState<DetectedImpact[] | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [manualAddId, setManualAddId] = useState("");
  const [result, setResult] = useState<IngestResult | null>(null);

  const originDoc = documents.find((d) => d.id === originDocumentId) ?? null;

  const canDetect = originDocumentId !== "" && summary.trim().length > 0;
  const canIngest =
    canDetect && originClauseId !== "" && source.trim().length > 0 && detected !== null;

  const remainingDocsForManualAdd = useMemo(
    () =>
      documents.filter(
        (d) => d.id !== originDocumentId && !confirmed.has(d.id),
      ),
    [documents, originDocumentId, confirmed],
  );

  function handleFile(f: File | null) {
    setFile(f);
  }

  function handleDetect() {
    const candidates = detectAffectedDocuments(
      documents,
      originDocumentId,
      summary,
      detail,
    );
    setDetected(candidates);
    setConfirmed(new Set(candidates.map((c) => c.documentId)));
  }

  function toggleConfirmed(id: string) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addManual() {
    if (!manualAddId) return;
    const doc = documents.find((d) => d.id === manualAddId);
    if (!doc) return;
    setDetected((prev) => [
      ...(prev ?? []),
      {
        documentId: doc.id,
        title: doc.title,
        citation: doc.citation,
        reason: "manually flagged by reviewing lawyer",
        score: 0,
      },
    ]);
    setConfirmed((prev) => new Set(prev).add(doc.id));
    setManualAddId("");
  }

  function handleIngest() {
    if (!detected) return;
    const affected: AffectedDocRef[] = detected
      .filter((d) => confirmed.has(d.documentId))
      .map((d) => ({
        documentId: d.documentId,
        title: d.title,
        citation: d.citation,
        relationship: d.reason || "flagged during ingestion review",
      }));

    const res = ingestChange(documents, {
      originDocumentId,
      originClauseId,
      type: changeType,
      date,
      source,
      summary,
      detail,
      affected,
    });
    setResult(res);
    onIngested(res);
  }

  function reset() {
    setFile(null);
    setChangeType("amendment");
    setOriginDocumentId("");
    setOriginClauseId("");
    setDate(todayISO());
    setSource("");
    setSummary("");
    setDetail("");
    setDetected(null);
    setConfirmed(new Set());
    setManualAddId("");
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
          {result.affectedCount} document{result.affectedCount !== 1 ? "s" : ""} flagged
          as affected across the graph — their status updates automatically, no manual
          edits required.
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
          Log an amendment, a court decision, or revised guidance once. The graph
          finds and flags every document it touches — checklists, templates, playbooks,
          and advisories included — instead of relying on someone remembering to
          re-check each one by hand.
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
          handleFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition ${
          dragOver ? "border-accent bg-surface-2" : "border-line bg-surface"
        }`}
      >
        <input
          type="file"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
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
            <label className={LABEL}>Type of change</label>
            <select
              value={changeType}
              onChange={(e) => setChangeType(e.target.value as ChangeType)}
              className={FIELD}
            >
              {CHANGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CHANGE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Effective / decision date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={FIELD}
            />
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
                setDetected(null);
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
          <label className={LABEL}>Source citation</label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. Court of Appeal in X v Y [2026] SGCA 12, or PDPC Consultation Paper Aug 2026"
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL}>What changed (one line)</label>
          <input
            type="text"
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              setDetected(null);
            }}
            placeholder="e.g. Deemed consent no longer covers AI training data"
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL}>Detail</label>
          <textarea
            value={detail}
            onChange={(e) => {
              setDetail(e.target.value);
              setDetected(null);
            }}
            rows={4}
            placeholder="Explain the change in enough detail that someone reading it later understands exactly what it requires and why."
            className={FIELD}
          />
        </div>

        <button
          type="button"
          onClick={handleDetect}
          disabled={!canDetect}
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Search size={14} />
          Detect affected documents
        </button>
      </div>

      {detected && (
        <div className="rounded-2xl border border-line bg-surface p-7 shadow-sm">
          <div className="flex items-center gap-1.5">
            <GitBranch size={16} className="text-ink" />
            <h3 className="text-sm font-semibold text-ink">
              Documents flagged as affected ({confirmed.size})
            </h3>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
            Auto-detected from shared practice areas and overlapping wording. Uncheck
            anything that doesn't apply, or add one manually below — this is the human
            check before the change propagates.
          </p>

          {detected.length === 0 ? (
            <p className="mt-3 text-sm text-ink-faint">
              No candidates detected automatically. You can still add documents manually.
            </p>
          ) : (
            <ul className="mt-3.5 space-y-2">
              {detected.map((d) => (
                <li
                  key={d.documentId}
                  className="flex items-start gap-3 rounded-xl border border-line-soft p-3"
                >
                  <input
                    type="checkbox"
                    checked={confirmed.has(d.documentId)}
                    onChange={() => toggleConfirmed(d.documentId)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{d.title}</p>
                    <p className="font-mono text-xs text-ink-soft">{d.citation}</p>
                    <p className="mt-0.5 text-xs italic text-ink-faint">{d.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3.5 flex items-center gap-2">
            <select
              value={manualAddId}
              onChange={(e) => setManualAddId(e.target.value)}
              className={`${FIELD} mt-0 flex-1`}
            >
              <option value="">Add another document manually…</option>
              {remainingDocsForManualAdd.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addManual}
              disabled={!manualAddId}
              className="rounded-xl border border-line px-3.5 py-2.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
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
