import { AlertTriangle, CheckCircle2, FileText, FileUp, Gavel, UploadCloud } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../api/client";

interface Props {
  onIngested: () => void;
}

type Mode = "document" | "law";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "handbook", label: "Handbook / manual" },
  { value: "template", label: "Template" },
  { value: "faq", label: "FAQ" },
  { value: "config", label: "System config (JSON)" },
  { value: "training", label: "Training material" },
  { value: "playbook", label: "Playbook" },
];

interface DocumentResult {
  name: string;
  segment_count: number;
  rule_count: number;
}

interface LawResult {
  created: boolean;
  update_id: string | null;
  title: string | null;
  changes_found: number;
  unmapped: { change_type: string; source_span: string }[];
  findings_created?: number;
  deferred_until?: string | null;
  message?: string;
}

const DROPZONE_ACCEPT: Record<Mode, string> = { document: ".docx,.pdf,.json", law: ".docx,.pdf" };

export default function UploadChangePanel({ onIngested }: Props) {
  const [mode, setMode] = useState<Mode>("document");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [type, setType] = useState("handbook");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docResult, setDocResult] = useState<DocumentResult | null>(null);
  const [lawResult, setLawResult] = useState<LawResult | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setFile(null);
    setError(null);
    setDocResult(null);
    setLawResult(null);
  }

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "document") {
        setDocResult(await api.uploadArtefact(file, type));
      } else {
        setLawResult(await api.uploadRegulatoryChange(file));
      }
      onIngested();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not upload this document");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setType("handbook");
    setError(null);
    setDocResult(null);
    setLawResult(null);
  }

  if (docResult) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface p-12 text-center shadow-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-good-line bg-good-bg">
          <CheckCircle2 size={26} className="text-good" />
        </div>
        <h2 className="mt-5 font-serif text-2xl font-medium text-ink">Document ingested</h2>
        <p className="mx-auto mt-3.5 max-w-sm text-sm leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">{docResult.name}</span> was parsed into{" "}
          {docResult.segment_count} segment{docResult.segment_count !== 1 ? "s" : ""}, with{" "}
          {docResult.rule_count} extracted rule{docResult.rule_count !== 1 ? "s" : ""}.
        </p>
        <p className="mt-3 text-xs text-ink-faint">
          It appears in search now, but shows no findings until a regulatory update affecting it
          has been logged and analysed.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2"
          >
            Upload another document
          </button>
        </div>
      </div>
    );
  }

  if (lawResult) {
    const noChanges = lawResult.changes_found === 0;
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface p-12 text-center shadow-md">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border ${
            noChanges ? "border-seminal-line bg-seminal-bg" : "border-good-line bg-good-bg"
          }`}
        >
          {noChanges ? (
            <AlertTriangle size={26} className="text-seminal" />
          ) : (
            <CheckCircle2 size={26} className="text-good" />
          )}
        </div>
        <h2 className="mt-5 font-serif text-2xl font-medium text-ink">
          {noChanges ? "No mapped changes found" : lawResult.deferred_until ? "Change logged, not yet in effect" : "Change in law applied"}
        </h2>
        {noChanges ? (
          <p className="mx-auto mt-3.5 max-w-sm text-sm leading-relaxed text-ink-soft">
            {lawResult.message ?? "Nothing in this document matched a concept the system tracks."}
          </p>
        ) : (
          <>
            <p className="mx-auto mt-3.5 max-w-sm text-sm leading-relaxed text-ink-soft">
              <span className="font-semibold text-ink">{lawResult.title}</span> was read as{" "}
              {lawResult.changes_found} change{lawResult.changes_found !== 1 ? "s" : ""}
              {!lawResult.created && " (already logged — this is the existing record)"}.
            </p>
            {lawResult.deferred_until ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-soft">
                <Gavel size={14} />
                This change takes effect on {lawResult.deferred_until} and hasn&rsquo;t been analysed against any
                document yet — it will be actioned automatically once that date arrives.
              </p>
            ) : (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-soft">
                <Gavel size={14} />
                {lawResult.findings_created ?? 0} finding{lawResult.findings_created === 1 ? "" : "s"} created
                across every document in the system that cites the affected concept.
              </p>
            )}
          </>
        )}
        {lawResult.unmapped.length > 0 && (
          <div className="mx-auto mt-4 max-w-sm rounded-lg border border-line-soft bg-surface-2 p-3 text-left">
            <p className="text-xs font-semibold text-ink-soft">
              {lawResult.unmapped.length} statement{lawResult.unmapped.length !== 1 ? "s" : ""} didn&rsquo;t match a
              known concept and was left out:
            </p>
            <ul className="mt-1.5 space-y-1">
              {lawResult.unmapped.map((u, i) => (
                <li key={i} className="text-xs italic text-ink-faint">
                  &ldquo;{u.source_span}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        )}
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
        <h2 className="font-serif text-2xl font-medium text-ink">Upload</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {mode === "document"
            ? "Add a firm document — an agreement, playbook, template, or manual — for extraction. It is only flagged once a regulatory update affecting it has been logged and analysed."
            : "Add a judgment, amendment, or circular. The system reads it, matches it against every concept it already tracks, and flags every affected document immediately — no manual entry required."}
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
        <button
          type="button"
          onClick={() => switchMode("document")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
            mode === "document" ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          <FileText size={14} /> Firm document
        </button>
        <button
          type="button"
          onClick={() => switchMode("law")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
            mode === "law" ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          <Gavel size={14} /> Change in law
        </button>
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
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragOver ? "border-accent bg-surface-2" : "border-line bg-surface"
        }`}
      >
        <input
          type="file"
          accept={DROPZONE_ACCEPT[mode]}
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
              {mode === "document" ? "Drop a DOCX, PDF, or JSON file here" : "Drop a DOCX or PDF file here"}
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">or click to browse</p>
          </>
        )}
      </label>

      {mode === "document" && (
        <div className="rounded-2xl border border-line bg-surface p-7 shadow-sm">
          <label className="text-xs font-semibold text-ink-soft">Document type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-ink-faint/20"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-bad-line bg-bad-bg p-3 text-sm text-bad">
          <AlertTriangle size={14} /> {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || busy}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Uploading…" : mode === "document" ? "Upload document" : "Read and apply"}
        </button>
      </div>
    </div>
  );
}
