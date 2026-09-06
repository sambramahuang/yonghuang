import { ChevronDown, Terminal, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import DocumentCard from "./components/DocumentCard";
import DocumentViewer from "./components/DocumentViewer";
import FilterBar from "./components/FilterBar";
import Modal from "./components/Modal";
import SearchBar from "./components/SearchBar";
import UploadChangePanel from "./components/UploadChangePanel";
import { getAllTypes, getEffectiveStatus, searchDocuments } from "./lib/legalGraph";
import { useLiveDocuments } from "./lib/liveDocuments";
import { api, ApiError, getToken, setToken } from "./api/client";
import LoginScreen from "./components/LoginScreen";
import type { RejectionReason, User } from "./api/types";
import type { ResolveAction } from "./components/DocumentPaper";
import type { ChangeStatus, SortKey } from "./types";

function Logo() {
  return <img src="/panopticon.png" alt="Panopticon" className="h-8 w-8 shrink-0 object-contain" />;
}

// The lawyer-facing app: search, plus a reviewer's affordance to add a firm
// document. Regulatory changes themselves are never entered by hand here —
// in the real system those are routed in automatically by the firm's
// horizon-scanning/scraping tool, via the structured intake API.
function LawyerApp() {
  const [token, setTokenState] = useState(getToken());
  const [user, setUser] = useState<User | null>(null);
  const { documents, error: loadError, reload, impactIdFor } = useLiveDocuments(token);
  // An approver is the senior capability and the backend grants it every
  // reviewer permission too (see requireCapability); hiding upload from them
  // would contradict the server, which accepts the request either way.
  const canUpload = user?.capability === "REVIEWER" || user?.capability === "APPROVER";
  const canApprove = user?.capability === "APPROVER";
  // A reviewer's step is submitting a drafted edit for someone else to approve.
  const canSubmit = user?.capability === "REVIEWER";
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyClauseId, setBusyClauseId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.me().then(setUser).catch(() => setUser(null));
  }, [token]);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("relevance");
  const [statuses, setStatuses] = useState<ChangeStatus[]>([]);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const types = useMemo(() => getAllTypes(documents), [documents]);

  const results = useMemo(
    () => searchDocuments(documents, query, { statuses, types: activeTypes }, sortKey),
    [documents, query, statuses, activeTypes, sortKey],
  );

  const selected = results.find((d) => d.id === selectedId) ?? results[0] ?? null;
  const activeFilterCount = statuses.length + activeTypes.length;

  function toggleStatus(status: ChangeStatus) {
    setStatuses((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  }

  function toggleType(type: string) {
    setActiveTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  // Deciding a flagged clause runs the real workflow, never a local toggle.
  //
  // Accepting a proposed edit submits it and then approves it, which writes a
  // new version of the artefact — the backend refuses if the same user does
  // both, so separation of duties holds exactly as it does over the API.
  // Accepting a flag with no edit to apply resolves through
  // /accept instead: the flag is recorded as read and the text stands.
  // Submitting is the reviewer's half of that split, offered on drafts.
  async function handleResolve(
    _documentId: string,
    clauseId: string,
    action: ResolveAction,
    reason: RejectionReason = "NOT_APPLICABLE",
    text?: string,
  ) {
    const id = impactIdFor(clauseId);
    if (!id) return;
    setActionError(null);
    setBusyClauseId(clauseId);
    try {
      const detail = await api.impact(id);
      if (action === "reject") {
        await api.reject(id, detail.revision, reason);
      } else if (action === "submit") {
        await api.submit(id, detail.revision);
      } else if (action === "edit") {
        if (text !== undefined) await api.editPatch(id, detail.revision, text);
      } else if (detail.proposed_patch) {
        await api.approve(id, detail.revision);
      } else {
        await api.accept(id, detail.revision);
      }
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : `Could not ${action} this finding`);
      reload();
    } finally {
      setBusyClauseId(null);
    }
  }

  if (!token) {
    return (
      <LoginScreen
        onSignedIn={(signedIn) => {
          setUser(signedIn);
          setTokenState(getToken());
        }}
      />
    );
  }

  const banner = actionError ?? loadError;

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-3">
            <Logo />
            <h1 className="font-serif text-[21px] font-medium leading-none tracking-tight text-ink">Panopticon</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setToken(""); setTokenState(""); setUser(null); }}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-2 hover:text-ink"
            >
              Sign out{user ? ` (${user.capability})` : ""}
            </button>
            {canUpload && (
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-paper shadow-sm hover:opacity-90"
              >
                <UploadCloud size={13} />
                Upload document
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {banner && (
          <p role="alert" className="mb-4 rounded-lg border border-bad-line bg-bad-bg p-3 text-sm text-bad">
            {banner}
          </p>
        )}
        <h2 className="mb-4 font-serif text-4xl font-medium text-ink">Documents</h2>

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <SearchBar
            query={query}
            onQueryChange={setQuery}
            sortKey={sortKey}
            onSortChange={setSortKey}
            rightSlot={
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  filtersOpen || activeFilterCount > 0
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-line bg-surface text-ink-soft hover:border-line-soft"
                }`}
              >
                Filters
                {activeFilterCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-paper">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-300 ${filtersOpen ? "rotate-180" : ""}`}
                />
              </button>
            }
          />
          <div className="mt-3">
            <FilterBar
              statuses={statuses}
              onToggleStatus={toggleStatus}
              types={types}
              activeTypes={activeTypes}
              onToggleType={toggleType}
              open={filtersOpen}
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
          <div className="space-y-3">
            <p className="pt-1 font-mono text-[11px] tracking-wide text-ink-faint">
              {results.length} DOCUMENT{results.length !== 1 ? "S" : ""}
            </p>
            {results.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                documents={documents}
                status={getEffectiveStatus(doc)}
                active={selected?.id === doc.id}
                onClick={() => setSelectedId(doc.id)}
              />
            ))}
            {results.length === 0 && (
              <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-faint">
                No documents match this search and filter combination.
              </p>
            )}
          </div>

          <div className="lg:sticky lg:top-3 lg:h-[calc(100vh-48px)]">
            {selected ? (
              <DocumentViewer
                doc={selected}
                documents={documents}
                canApprove={canApprove}
                canSubmit={canSubmit}
                busyClauseId={busyClauseId}
                onResolve={handleResolve}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-faint">
                Select a document to view its clauses
              </div>
            )}
          </div>
        </div>
      </main>

      {showUpload && canUpload && (
        <Modal onClose={() => setShowUpload(false)} wide>
          <UploadChangePanel onIngested={() => reload()} />
        </Modal>
      )}
    </div>
  );
}

// The ingestion console: stands in for the firm's automated scraping/
// horizon-scanning pipeline. Deliberately not reachable from the lawyer app
// — reached only at /ingest, e.g. from a separate machine for a demo. It
// posts straight to the same backend the lawyer app reads from.
function IngestionConsole() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-3.5">
            <Logo />
            <div>
              <h1 className="font-serif italic text-xl font-medium leading-none text-ink">Panopticon</h1>
              <p className="mt-1.5 text-xs text-ink-faint">Ingestion console</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-seminal-line bg-seminal-bg px-3 py-1.5 text-xs font-semibold text-seminal">
            <Terminal size={13} />
            Internal tool — not shown to lawyers
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <UploadChangePanel onIngested={() => {}} />
      </main>
    </div>
  );
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "/ingest" ? <IngestionConsole /> : <LawyerApp />;
}

export default App;
