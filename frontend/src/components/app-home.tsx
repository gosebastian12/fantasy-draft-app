"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { clearToken, getToken, setToken } from "@/lib/session";

type MyLeague = {
  id: string;
  name: string;
  slug: string;
  draft_scheduled_at: string | null;
  is_commissioner: boolean;
};

export function AppHome() {
  const [token, setTokenState] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<MyLeague[]>([]);
  const [loadError, setLoadError] = useState("");
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000", []);

  useEffect(() => {
    setTokenState(getToken());
  }, []);

  const loadLeagues = useCallback(async () => {
    const t = getToken();
    if (!t) {
      setLeagues([]);
      return;
    }
    const res = await fetch(`${apiBase}/api/me/leagues`, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    if (res.status === 401) {
      clearToken();
      setTokenState(null);
      setLoadError("Session expired. Please sign in again.");
      return;
    }
    if (!res.ok) {
      setLoadError("Could not load your leagues.");
      return;
    }
    setLoadError("");
    const data = (await res.json()) as MyLeague[];
    setLeagues(data);
  }, [apiBase]);

  useEffect(() => {
    if (token) void loadLeagues();
  }, [token, loadLeagues]);

  const persistToken = (accessToken: string) => {
    setToken(accessToken);
    setTokenState(accessToken);
  };

  const onLogout = () => {
    clearToken();
    setTokenState(null);
    setLeagues([]);
  };

  const onAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthMessage("");
    const path = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    const body =
      authMode === "register"
        ? {
            email,
            password,
            display_name: displayName.trim() || null,
          }
        : { email, password };

    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = (err as { detail?: string }).detail;
      setAuthMessage(typeof detail === "string" ? detail : "Something went wrong.");
      return;
    }
    const data = (await res.json()) as { access_token: string };
    persistToken(data.access_token);
    setAuthMessage("");
    setPassword("");
  };

  if (!token) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl">
          <h1 className="text-xl font-semibold text-white">Fantasy Draft</h1>
          <p className="mt-2 text-sm text-slate-400">
            Create an account or sign in to see your leagues and open the draft room.
          </p>

          <div className="mt-6 flex gap-2 rounded-lg bg-slate-950/80 p-1">
            <button
              type="button"
              onClick={() => setAuthMode("register")}
              className={clsx(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
                authMode === "register" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200",
              )}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className={clsx(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
                authMode === "login" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200",
              )}
            >
              Sign in
            </button>
          </div>

          <form className="mt-6 space-y-3" onSubmit={onAuthSubmit}>
            <label className="block text-xs font-medium text-slate-400">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs font-medium text-slate-400">
              Password (min 8 characters)
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            {authMode === "register" ? (
              <label className="block text-xs font-medium text-slate-400">
                Display name (optional)
                <input
                  type="text"
                  value={displayName}
                  onChange={(ev) => setDisplayName(ev.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
            ) : null}
            <button
              type="submit"
              className="w-full rounded-md bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              {authMode === "register" ? "Create account" : "Sign in"}
            </button>
          </form>
          {authMessage ? <p className="mt-3 text-xs text-rose-400">{authMessage}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-950 px-4 py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Your leagues</h1>
            <p className="mt-1 text-sm text-slate-400">
              You can only open draft rooms for leagues you belong to.
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="shrink-0 rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-900"
          >
            Sign out
          </button>
        </header>

        {loadError ? <p className="text-sm text-rose-400">{loadError}</p> : null}

        {leagues.length === 0 && !loadError ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
            You are not in any leagues yet. Ask your commissioner to add you, or create a league from the
            commissioner tools inside a draft room once you have access.
          </p>
        ) : (
          <ul className="space-y-3">
            {leagues.map((league) => (
              <li
                key={league.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{league.name}</p>
                  <p className="text-xs text-slate-500">{league.slug}</p>
                  {league.draft_scheduled_at ? (
                    <p className="mt-1 text-xs text-sky-300">
                      Draft scheduled: {new Date(league.draft_scheduled_at).toLocaleString()}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">No draft time scheduled.</p>
                  )}
                  {league.is_commissioner ? (
                    <span className="mt-2 inline-block rounded bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                      Commissioner
                    </span>
                  ) : null}
                </div>
                <Link
                  href={`/draft/${league.id}`}
                  className="inline-flex items-center justify-center rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
                >
                  Open draft room
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
