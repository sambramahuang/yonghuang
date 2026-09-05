import { Search as SearchIcon, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import ClientDropdown from "./components/ClientDropdown";
import DocumentCard from "./components/DocumentCard";
import DocumentViewer from "./components/DocumentViewer";
import FilterBar from "./components/FilterBar";
import SearchBar from "./components/SearchBar";
import UploadChangePanel from "./components/UploadChangePanel";
import { DOCUMENTS } from "./data/mockData";
import {
  getAllClients,
  getAllTypes,
  getEffectiveStatus,
  searchDocuments,
  setApproval,
} from "./lib/legalGraph";
import type { ChangeStatus, FirmDocument, SortKey } from "./types";

type View = "search" | "upload";

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
      <line x1="16" y1="5" x2="16" y2="24" />
      <line x1="6.5" y1="9" x2="25.5" y2="9" />
      <path d="M7 9l-1 5.2M7 9l3 7.2M7 9l-0.4 9.4" strokeWidth="1.1" />
      <circle cx="6" cy="14.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="10" cy="16.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="6.6" cy="18.4" r="1.5" fill="currentColor" stroke="none" />
      <path d="M25 9l1 5.2M25 9l-3 7.2M25 9l0.4 9.4" strokeWidth="1.1" />
      <circle cx="26" cy="14.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="22" cy="16.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="25.4" cy="18.4" r="1.5" fill="currentColor" stroke="none" />
      <line x1="10" y1="27" x2="22" y2="27" />
      <line x1="16" y1="24" x2="16" y2="27" />
    </svg>
  );
}

function App() {
  const [documents, setDocuments] = useState<FirmDocument[]>(DOCUMENTS);
  const [view, setView] = useState<View>("search");

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
    setStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }

  function toggleType(type: string) {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  function handleToggleApproval(documentId: string, clauseId: string, approved: boolean) {
    setDocuments((prev) => setApproval(prev, documentId, clauseId, approved));
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-3.5">
            <Logo />
            <div>
              <h1 className="font-serif italic text-xl font-medium leading-none text-ink">RegGraph</h1>
              <p className="mt-1.5 text-xs text-ink-faint">
                Search the firm's tools, systems &amp; practices
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-[11px] border border-line bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setView("search")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                view === "search" ? "bg-surface text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"
              }`}
            >
              <SearchIcon size={14} />
              Search
            </button>
            <button
              type="button"
              onClick={() => setView("upload")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                view === "upload" ? "bg-surface text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"
              }`}
            >
              <UploadCloud size={14} />
              Upload change
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {view === "upload" ? (
          <UploadChangePanel
            documents={documents}
            onIngested={(res) => setDocuments(res.documents)}
          />
        ) : (
          <>
            <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
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
          </>
        )}
      </main>
    </div>
  );
}

export default App;
