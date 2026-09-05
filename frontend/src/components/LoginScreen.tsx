import { useState } from "react";
import { api, ApiError, setToken } from "../api/client";
import type { User } from "../api/types";

interface Props {
  onSignedIn: (user: User) => void;
}

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
          <h1 className="font-serif text-2xl italic text-ink">Panopticon</h1>
          <p className="mt-1.5 text-sm text-ink-faint">Sign in to review regulatory impact</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn(username, password);
          }}
          className="rounded-xl border border-line bg-transparent p-5"
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

      </div>
    </div>
  );
}
