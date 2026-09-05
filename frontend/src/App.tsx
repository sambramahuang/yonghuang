import { AlertCircle, PlayCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, getToken, setToken } from "./api/client";
import { STATUS_ORDER, SYSTEM_STATUS } from "./api/statusConfig";
import type { ImpactSummary, RegulatoryUpdate, SystemStatus, User } from "./api/types";
import ImpactCard from "./components/ImpactCard";
import ImpactDetailView from "./components/ImpactDetailView";
import LoginScreen from "./components/LoginScreen";

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

const STATUSES: SystemStatus[] = [
  "UPDATE_NEEDED",
  "LEGAL_REVIEW_REQUIRED",
  "POSSIBLE_IMPACT",
  "CURRENT",
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState(getToken());
  const [updates, setUpdates] = useState<RegulatoryUpdate[]>([]);
  const [updateId, setUpdateId] = useState<string>("");
  const [impacts, setImpacts] = useState<ImpactSummary[]>([]);
  const [statuses, setStatuses] = useState<SystemStatus[]>([]);
  const [openOnly, setOpenOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [me, list] = await Promise.all([
        api.me(),
        api.impacts(updateId ? { update_id: updateId } : {}),
      ]);
      setUser(me);
      setImpacts(list);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load");
      if (e instanceof ApiError && e.status === 401) setUser(null);
    }
  }, [token, updateId]);

  useEffect(() => {
    if (!token) return;
    api
      .regulatoryUpdates()
      .then((u) => {
        setUpdates(u);
        setUpdateId((current) => current || (u[0] ? String(u[0].id) : ""));
      })
      .catch(() => {
        /* surfaced by refresh() */
      });
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const filtered = impacts.filter(
      (i) =>
        (statuses.length === 0 || statuses.includes(i.system_status)) &&
        (!openOnly || (i.resolution === null && i.system_status !== "CURRENT")),
    );
    return [...filtered].sort(
      (a, b) =>
        STATUS_ORDER[b.system_status] - STATUS_ORDER[a.system_status] ||
        a.name.localeCompare(b.name),
    );
  }, [impacts, statuses, openOnly]);

  const selected = visible.find((i) => i.id === selectedId) ?? visible[0] ?? null;

  const counts = useMemo(() => {
    const by = {} as Record<SystemStatus, number>;
    for (const s of STATUSES) by[s] = impacts.filter((i) => i.system_status === s).length;
    return by;
  }, [impacts]);

  async function analyse() {
    if (!updateId) return;
    setBusy(true);
    try {
      await api.analyse(updateId);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setToken("");
    setTokenState("");
    setUser(null);
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

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-3.5">
            <Logo />
            <div>
              <h1 className="font-serif text-xl font-medium italic leading-none text-ink">RegGraph</h1>
              <p className="mt-1.5 text-xs text-ink-faint">
                Which of the firm's documents did this change break?
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={updateId}
              onChange={(e) => setUpdateId(e.target.value)}
              className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink"
            >
              {updates.map((u) => (
                <option key={String(u.id)} value={String(u.id)}>
                  {u.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={analyse}
              disabled={busy || !updateId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-40"
            >
              <PlayCircle size={14} />
              {busy ? "Analysing…" : "Analyse"}
            </button>
            <span className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink-soft">
              {user ? `${user.name} · ${user.capability}` : "…"}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink-faint hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {error && (
          <p className="mb-4 flex items-center gap-2 rounded-lg border border-bad-line bg-bad-bg p-3 text-sm text-bad">
            <AlertCircle size={15} />
            {error}
          </p>
        )}

        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map((s) => {
              const on = statuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setStatuses((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                    )
                  }
                  className={`rounded-full border px-2.5 py-1 text-sm transition ${
                    on
                      ? `${SYSTEM_STATUS[s].bg} ${SYSTEM_STATUS[s].text} ${SYSTEM_STATUS[s].border}`
                      : "border-line bg-surface-2 text-ink-faint hover:text-ink-soft"
                  }`}
                >
                  {SYSTEM_STATUS[s].short}
                  <span className="ml-1.5 font-mono text-[11px] opacity-70">{counts[s] ?? 0}</span>
                </button>
              );
            })}
            <label className="ml-auto flex items-center gap-1.5 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={openOnly}
                onChange={(e) => setOpenOnly(e.target.checked)}
              />
              Open findings only
            </label>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
          <div className="space-y-3">
            <p className="font-mono text-[11px] tracking-wide text-ink-faint">
              {visible.length} FINDING{visible.length !== 1 ? "S" : ""}
            </p>
            {visible.map((impact) => (
              <ImpactCard
                key={impact.id}
                impact={impact}
                active={selected?.id === impact.id}
                onClick={() => setSelectedId(impact.id)}
              />
            ))}
            {visible.length === 0 && (
              <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-faint">
                No findings match these filters. Run Analyse to generate them.
              </p>
            )}
          </div>

          <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-160px)]">
            {selected ? (
              <ImpactDetailView
                key={selected.id}
                impactId={selected.id}
                user={user}
                onChanged={refresh}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-faint">
                Select a finding to inspect its evidence
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
