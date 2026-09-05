import { Terminal } from "lucide-react";
import { useMemo, useState } from "react";
import ClientDropdown from "./components/ClientDropdown";
import DocumentCard from "./components/DocumentCard";
import DocumentViewer from "./components/DocumentViewer";
import FilterBar from "./components/FilterBar";
import SearchBar from "./components/SearchBar";
import UploadChangePanel from "./components/UploadChangePanel";
import { getAllClients, getAllTypes, getEffectiveStatus, searchDocuments, setApproval } from "./lib/legalGraph";
import { useSharedDocuments } from "./lib/sharedDocuments";
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
  const [documents, setDocuments] = useSharedDocuments();

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("relevance");
  const [statuses, setStatuses] = useState<ChangeStatus[]>([]);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [client, setClient] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  function handleToggleApproval(documentId: string, clauseId: string, approved: boolean) {
    setDocuments((prev) => setApproval(prev, documentId, clauseId, approved));
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold leading-none text-ink">RegGraph</h1>
              <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                Lawyer
              </span>
            </div>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Read-only search</p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-brand">Search</p>
          <h2 className="mt-2 max-w-2xl text-[28px] font-bold leading-[1.15] tracking-tight text-ink sm:text-[32px]">
            Every clause, traced across the firm.
          </h2>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            Log a change once and every document citing the same authority lights up automatically.
          </p>
          <div className="mt-6 flex items-center gap-2 text-ink-faint">
            <span className="text-xs">+</span>
            <div className="h-0 flex-1 border-t border-dashed border-line" />
            <span className="text-xs">+</span>
          </div>
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

          <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-140px)]">
            {selected ? (
              <DocumentViewer doc={selected} documents={documents} onToggleApproval={handleToggleApproval} />
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-faint">
                Select a document to view its clauses
              </div>
            )}
          </div>
        </div>
      </main>
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
