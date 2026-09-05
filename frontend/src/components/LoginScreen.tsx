import { useState } from "react";
import { api, ApiError, setToken } from "../api/client";
import type { User } from "../api/types";

interface Props {
  onSignedIn: (user: User) => void;
}

// Seeded local demo accounts. Shown on screen deliberately: these are
// well-known development credentials, not secrets.
const DEMO_ACCOUNTS = [
  { username: "rachel", password: "reviewer123", role: "Reviewer — edits and submits patches" },
  { username: "daniel", password: "approver123", role: "Approver — approves, writing a new version" },
];

export default function LoginScreen({ onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(user: string, pass: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.login(user, pass);
      setToken(result.token);
      onSignedIn(result.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-serif text-2xl italic text-ink">RegGraph</h1>
          <p className="mt-1.5 text-sm text-ink-faint">Sign in to review regulatory impact</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn(username, password);
          }}
          className="rounded-xl border border-line bg-surface p-5 shadow-sm"
        >
          <label className="block text-sm font-medium text-ink-soft" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-line disabled:opacity-60"
          />

          <label className="mt-4 block text-sm font-medium text-ink-soft" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-line disabled:opacity-60"
          />

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-bad-line bg-bad-bg px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !username || !password}
            className="mt-4 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 rounded-xl border border-dashed border-line p-4">
          <p className="font-mono text-[11px] tracking-wide text-ink-faint">DEMO ACCOUNTS</p>
          <div className="mt-2 space-y-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.username}
                type="button"
                disabled={busy}
                onClick={() => {
                  setUsername(a.username);
                  setPassword(a.password);
                  void signIn(a.username, a.password);
                }}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-left transition hover:border-line-soft hover:shadow-sm disabled:opacity-50"
              >
                <span className="font-mono text-sm text-ink">{a.username}</span>
                <span className="ml-2 font-mono text-xs text-ink-faint">{a.password}</span>
                <p className="mt-0.5 text-xs text-ink-faint">{a.role}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
