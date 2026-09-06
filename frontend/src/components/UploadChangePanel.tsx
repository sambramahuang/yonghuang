import { AlertTriangle, CheckCircle2, FileText, Gavel, Loader2, UploadCloud, X } from "lucide-react";
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
  status: "success" | "error";
  segment_count?: number;
  rule_count?: number;
  findings_created?: number;
  error?: string;
}

interface LawResult {
  created: boolean;
  update_id: string | null;
  title: string | null;
  changes_found: number;
  unmapped: { change_type: string; source_span: string }[];
  findings_created?: number;
  not_actioned?: { segment_id: number; artefact_id: number; name: string; locator: string; text: string; reason: string }[];
  gaps?: { change_id: number; concept: string; explanation: string }[];
  deferred_until?: string | null;
  message?: string;
}

const DROPZONE_ACCEPT: Record<Mode, string> = { document: ".docx,.pdf,.json", law: ".docx,.pdf" };

export default function UploadChangePanel({ onIngested }: Props) {
  const [mode, setMode] = useState<Mode>("document");
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [type, setType] = useState("handbook");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docResults, setDocResults] = useState<DocumentResult[] | null>(null);
  const [lawResult, setLawResult] = useState<LawResult | null>(null);
  // A batch of amendments: several notices often land together, and uploading
  // them one at a time hides which of them actually changed anything.
  const [lawResults, setLawResults] = useState<{ name: string; result?: LawResult; error?: string }[] | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setFile(null);
    setFiles([]);
    setError(null);
    setDocResults(null);
    setLawResult(null);
    setLawResults(null);
  }

  function addFiles(incoming: FileList | File[]) {
    const list = Array.from(incoming);
    if (!list.length) return;
    // Dropping or browsing again adds to the queue rather than replacing it,
    // so a batch can be built up from several drags/selections.
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...list.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    setBusy(true);
    setError(null);
    if (mode === "law") {
      const batch = files.length ? files : file ? [file] : [];
      if (!batch.length) { setBusy(false); return; }
      // Sequential for the same reason as documents: each notice is read by a
      // model and then analysed against the whole corpus. One bad notice must
      // not stop the rest.
      setProgress({ done: 0, total: batch.length });
      const collected: { name: string; result?: LawResult; error?: string }[] = [];
      for (const f of batch) {
        try {
          collected.push({ name: f.name, result: await api.uploadRegulatoryChange(f) });
        } catch (e) {
          collected.push({ name: f.name, error: e instanceof ApiError ? e.message : "Could not read this document" });
        }
        setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      setProgress(null);
      // One notice keeps the existing detailed view; several get a summary.
      if (collected.length === 1 && collected[0].result) setLawResult(collected[0].result);
      else setLawResults(collected);
      onIngested();
      setBusy(false);
      return;
    }

    if (!files.length) { setBusy(false); return; }
    // Sequential, not concurrent: extraction already fans out per-segment on
    // the backend, and live mode calls a real model per file — running many
    // files at once would multiply that fan-out instead of adding to a queue.
    // One bad file must not stop the rest of the batch from ingesting.
    setProgress({ done: 0, total: files.length });
    const results: DocumentResult[] = [];
    for (const f of files) {
      try {
        const r = await api.uploadArtefact(f, type);
        results.push({
          name: f.name,
          status: "success",
          segment_count: r.segment_count,
          rule_count: r.rule_count,
          findings_created: r.findings_created,
        });
      } catch (e) {
        results.push({ name: f.name, status: "error", error: e instanceof ApiError ? e.message : "Could not ingest this document" });
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setDocResults(results);
    setProgress(null);
    setBusy(false);
    onIngested();
  }

  function reset() {
    setFile(null);
    setFiles([]);
    setType("handbook");
    setError(null);
    setDocResults(null);
    setLawResult(null);
    setLawResults(null);
  }

  if (docResults) {
    const successCount = docResults.filter((r) => r.status === "success").length;
    const failCount = docResults.length - successCount;
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface p-12 text-center shadow-md">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border ${
            failCount ? "border-seminal-line bg-seminal-bg" : "border-good-line bg-good-bg"
          }`}
        >
          {failCount ? <AlertTriangle size={26} className="text-seminal" /> : <CheckCircle2 size={26} className="text-good" />}
        </div>
        <h2 className="mt-5 font-serif text-2xl font-medium text-ink">
          {docResults.length === 1
            ? failCount
              ? "Document failed to ingest"
              : "Document ingested"
            : `${successCount} of ${docResults.length} documents ingested`}
        </h2>
        <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left">
          {docResults.map((r, i) => (
            <li key={i} className="rounded-lg border border-line-soft bg-surface-2 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold text-ink">{r.name}</span>
                {r.status === "success" ? (
                  <CheckCircle2 size={14} className="shrink-0 text-good" />
                ) : (
                  <AlertTriangle size={14} className="shrink-0 text-bad" />
                )}
              </div>
              {r.status === "success" ? (
                <>
                  <p className="mt-1 text-ink-faint">
                    {r.segment_count} segment{r.segment_count !== 1 ? "s" : ""}, {r.rule_count} extracted rule
                    {r.rule_count !== 1 ? "s" : ""}
                  </p>
                  {!!r.findings_created && (
                    <p className="mt-1 flex items-center gap-1.5 text-seminal">
                      <AlertTriangle size={12} className="shrink-0" />
                      Already conflicts with {r.findings_created} regulatory change{r.findings_created !== 1 ? "s" : ""} on
                      file — flagged for review now, before it ships to anyone.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-bad">{r.error}</p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-faint">
          Ingested documents appear in search now. Each was also checked against every regulatory
          change already on file — most show no findings until a future update affects them, but one
          that already conflicts with an existing change is flagged above, immediately.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2"
          >
            Upload more documents
          </button>
        </div>
      </div>
    );
  }

  if (lawResults) {
    const total = lawResults.reduce((n, r) => n + (r.result?.findings_created ?? 0), 0);
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-serif text-lg text-ink">
            {lawResults.length} change{lawResults.length === 1 ? "" : "s"} in law read
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {total
              ? `${total} finding${total === 1 ? "" : "s"} raised across the corpus.`
              : "None of these changes affected a document in the corpus."}
          </p>
        </div>
        <ul className="space-y-2">
          {lawResults.map((r) => (
            <li key={r.name} className="rounded-xl border border-line bg-surface p-3.5">
              <p className="text-sm font-semibold text-ink">{r.result?.title ?? r.name}</p>
              {r.error ? (
                <p className="mt-1 text-xs text-bad">{r.error}</p>
              ) : (
                <p className="mt-1 text-xs text-ink-soft">
                  {r.result?.changes_found ?? 0} change{r.result?.changes_found === 1 ? "" : "s"} read
                  {r.result?.deferred_until
                    ? ` — takes effect ${r.result.deferred_until}, not yet analysed`
                    : ` — ${r.result?.findings_created ?? 0} finding${r.result?.findings_created === 1 ? "" : "s"}`}
                  {r.result && !r.result.created && " (already logged)"}
                </p>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2"
        >
          Upload more
        </button>
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

        {!!lawResult.gaps?.length && (
          <div className="mx-auto mt-4 max-w-sm rounded-lg border border-seminal-line bg-seminal-bg p-3 text-left">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-seminal">
              <AlertTriangle size={13} />
              {lawResult.gaps.length} gap{lawResult.gaps.length !== 1 ? "s" : ""} identified — no existing document
              addresses {lawResult.gaps.length !== 1 ? "these duties" : "this duty"}:
            </p>
            <ul className="mt-1.5 space-y-1">
              {lawResult.gaps.map((g) => (
                <li key={g.change_id} className="text-xs text-ink-soft">
                  <span className="font-semibold text-ink">{g.concept}</span> — {g.explanation}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!!lawResult.not_actioned?.length && (
          <div className="mx-auto mt-4 max-w-sm rounded-lg border border-line-soft bg-surface-2 p-3 text-left">
            <p className="text-xs font-semibold text-ink-soft">
              {lawResult.not_actioned.length} statement{lawResult.not_actioned.length !== 1 ? "s" : ""} matched but{" "}
              {lawResult.not_actioned.length !== 1 ? "weren't" : "wasn't"} actioned:
            </p>
            <ul className="mt-1.5 space-y-1">
              {lawResult.not_actioned.map((n) => (
                <li key={n.segment_id} className="text-xs text-ink-faint">
                  <span className="font-semibold text-ink-soft">{n.name}</span> ({n.reason.toLowerCase()}) —{" "}
                  <span className="italic">&ldquo;{n.text}&rdquo;</span>
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
            ? "Add a firm document — an agreement, playbook, template, or manual — for extraction. It's checked immediately against every regulatory change already on file, so a clause already out of date is flagged on arrival rather than waiting for the next update."
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
          addFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragOver ? "border-accent bg-surface-2" : "border-line bg-surface"
        }`}
      >
        <input
          type="file"
          multiple
          accept={DROPZONE_ACCEPT[mode]}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <>
            <UploadCloud size={22} className="text-ink-faint" />
            <p className="mt-2.5 text-sm font-medium text-ink">
              {mode === "document" ? "Drop DOCX, PDF, or JSON files here" : "Drop DOCX or PDF notices here"}
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">
              or click to browse — select or drop as many as you like
            </p>
        </>
      </label>

      {files.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold text-ink-soft">
            {files.length} file{files.length !== 1 ? "s" : ""} queued
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {files.map((f, i) => (
              <li
                key={`${f.name}:${f.size}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-line-soft bg-surface-2 px-3 py-2 text-xs"
              >
                <span className="min-w-0 truncate text-ink">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={busy}
                  aria-label={`Remove ${f.name}`}
                  className="shrink-0 text-ink-faint hover:text-bad disabled:opacity-40"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === "document" && (
        <div className="rounded-2xl border border-line bg-surface p-7 shadow-sm">
          <label className="text-xs font-semibold text-ink-soft">Document type</label>
          <p className="mt-0.5 text-xs text-ink-faint">Applied to every file in this batch.</p>
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
          disabled={files.length === 0 || busy}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {progress
            ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
            : busy
              ? "Uploading…"
              : mode === "law"
                ? "Read and apply"
                : files.length > 1
                  ? `Upload ${files.length} documents`
                  : "Upload document"}
        </button>
      </div>
    </div>
  );
}
