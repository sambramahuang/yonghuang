import { ChevronDown, Terminal, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ClientDropdown from "./components/ClientDropdown";
import DocumentCard from "./components/DocumentCard";
import DocumentViewer from "./components/DocumentViewer";
import FilterBar from "./components/FilterBar";
import Modal from "./components/Modal";
import SearchBar from "./components/SearchBar";
import UploadChangePanel from "./components/UploadChangePanel";
import { getAllClients, getAllTypes, getEffectiveStatus, searchDocuments } from "./lib/legalGraph";
import { ROLE_LABEL, type Role } from "./lib/role";
import { useSharedDocuments } from "./lib/sharedDocuments";
import { useLiveDocuments } from "./lib/liveDocuments";
import { api, ApiError, getToken, setToken } from "./api/client";
import LoginScreen from "./components/LoginScreen";
import type { User } from "./api/types";
import type { ChangeStatus, SortKey } from "./types";

function Logo() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
      <svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <line x1="16" y1="5" x2="16" y2="24" />
        <line x1="6.5" y1="9" x2="25.5" y2="9" />
        <path d="M7 9l-1 5.2M7 9l3 7.2M7 9l-0.4 9.4" strokeWidth="1.2" />
        <circle cx="6" cy="14.2" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="10" cy="16.2" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="6.6" cy="18.4" r="1.4" fill="currentColor" stroke="none" />
        <path d="M25 9l1 5.2M25 9l-3 7.2M25 9l0.4 9.4" strokeWidth="1.2" />
        <circle cx="26" cy="14.2" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="22" cy="16.2" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="25.4" cy="18.4" r="1.4" fill="currentColor" stroke="none" />
        <line x1="10" y1="27" x2="22" y2="27" />
        <line x1="16" y1="24" x2="16" y2="27" />
      </svg>
    </div>
  );
}

// The lawyer-facing app: search only. There is no upload affordance here —
// in the real system, changes are routed in automatically by the firm's
// horizon-scanning/scraping tool, never entered by hand at this screen.
function LawyerApp() {
  const [token, setTokenState] = useState(getToken());
  const [user, setUser] = useState<User | null>(null);
  const { documents, error: loadError, reload, impactIdFor } = useLiveDocuments(token);
  // Permissions follow the signed-in user's backend capability. A local role
  // picker alongside real authentication was actively misleading: it hid the
  // upload affordance from an APPROVER because the picker still said
  // "Associate", while approval itself ignored the picker entirely.
  const role: Role = user?.capability === "APPROVER" ? "senior_partner" : "associate";
  const canUpload = user?.capability === "APPROVER" || user?.capability === "REVIEWER";
  const canApprove = user?.capability === "APPROVER";
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.me().then(setUser).catch(() => setUser(null));
  }, [token]);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("relevance");
  const [statuses, setStatuses] = useState<ChangeStatus[]>([]);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [client, setClient] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const types = useMemo(() => getAllTypes(documents), [documents]);
  const clients = useMemo(() => getAllClients(documents), [documents]);

  const results = useMemo(
    () => searchDocuments(documents, query, { statuses, types: activeTypes, client }, sortKey),
    [documents, query, statuses, activeTypes, client, sortKey],
  );

  const selected = results.find((d) => d.id === selectedId) ?? results[0] ?? null;

  function toggleStatus(status: ChangeStatus) {
    setStatuses((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  }

  function toggleType(type: string) {
    setActiveTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  // Approving a redline runs the real workflow: submit it, then approve it.
  // The backend refuses if the same user does both, so separation of duties
  // still holds exactly as it does over the API.
  async function handleToggleApproval(_documentId: string, clauseId: string, approved: boolean) {
    const id = impactIdFor(clauseId);
    if (!id || !approved) return;
    setActionError(null);
    try {
      const detail = await api.impact(id);
      const submitted = detail.workflow_state === "SUBMITTED"
        ? detail
        : await api.submit(id, detail.revision);
      await api.approve(id, submitted.revision);
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not approve this change");
      reload();
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
      <header className="bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-3">
            <Logo />
            <h1 className="font-serif text-[21px] font-medium leading-none tracking-tight text-ink">RegGraph</h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs font-semibold uppercase tracking-wider text-ink-faint sm:block">
              Read-only search
            </p>
            <div className="relative flex items-center">
              <span className="rounded-full border border-line bg-surface py-2 px-4 text-xs font-medium text-ink">
                {user ? `${user.name} · ${ROLE_LABEL[role]}` : "…"}
              </span>
              <button
                type="button"
                onClick={() => { setToken(""); setTokenState(""); setUser(null); }}
                className="ml-2 rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink-faint hover:text-ink"
              >
                Sign out{user ? ` (${user.capability})` : ""}
              </button>
              <ChevronDown
                size={14}
                strokeWidth={2.25}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
              />
            </div>
            {canUpload && (
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-paper shadow-sm hover:opacity-90"
              >
                <UploadCloud size={13} />
                Upload change
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
        <section className="mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-brand">Search</p>
          <h2 className="mt-3 max-w-3xl font-serif text-[44px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[60px]">
            Every clause, traced across the firm.
          </h2>
          <p className="mt-4 max-w-xl text-base text-ink-soft">
            Log a change once and every document citing the same authority lights up automatically.
          </p>
        </section>

        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <SearchBar query={query} onQueryChange={setQuery} sortKey={sortKey} onSortChange={setSortKey} />
          <div className="mt-3 border-t border-line-soft pt-3">
            <FilterBar
              statuses={statuses}
              onToggleStatus={toggleStatus}
              types={types}
              activeTypes={activeTypes}
              onToggleType={toggleType}
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
          <div className="space-y-3">
            <ClientDropdown clients={clients} value={client} onChange={setClient} />
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

          <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-90px)]">
            {selected ? (
              <DocumentViewer
                doc={selected}
                documents={documents}
                canApprove={canApprove}
                onToggleApproval={handleToggleApproval}
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
          <UploadChangePanel documents={documents} onIngested={() => reload()} />
        </Modal>
      )}
    </div>
  );
}

// The ingestion console: stands in for the firm's automated scraping/
// horizon-scanning pipeline. Deliberately not reachable from the lawyer app
// — reached only at /ingest, e.g. from a separate machine for a demo.
function IngestionConsole() {
  const [documents, setDocuments] = useSharedDocuments();

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-3.5">
            <Logo />
            <div>
              <h1 className="font-serif italic text-xl font-medium leading-none text-ink">RegGraph</h1>
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
        <UploadChangePanel documents={documents} onIngested={(res) => setDocuments(res.documents)} />
      </main>
    </div>
  );
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "/ingest" ? <IngestionConsole /> : <LawyerApp />;
}

export default App;
