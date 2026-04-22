"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";

type TabKey = "board" | "players" | "trades" | "commissioner";

type DraftPick = {
  id: string;
  round: number;
  overall: number;
  teamName: string;
  playerName: string;
  at: string;
};

type TradeFeedItem = {
  id: string;
  summary: string;
  at: string;
};

type Player = {
  id: string;
  full_name: string;
  position: string;
  nfl_team: string | null;
};

type Team = {
  id: string;
  name: string;
  draft_position: number | null;
};

type DraftSession = {
  league: { id: string; name: string; slug: string; draft_scheduled_at?: string | null };
  teams: Team[];
  players: Player[];
  trades: {
    id: string;
    status: string;
    message: string | null;
    created_at?: string;
    executed_at: string | null;
  }[];
};

export function DraftRoomShell({ leagueId, accessToken }: { leagueId: string; accessToken: string }) {
  const [tab, setTab] = useState<TabKey>("board");
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [trades, setTrades] = useState<TradeFeedItem[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [leagueName, setLeagueName] = useState("Live room");
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [sessionMessage, setSessionMessage] = useState<string>("");
  const [allTrades, setAllTrades] = useState<DraftSession["trades"]>([]);
  const [commissionerMessage, setCommissionerMessage] = useState("");
  const [newLeagueName, setNewLeagueName] = useState("");
  const [commissionerDisplayName, setCommissionerDisplayName] = useState("");
  const [commissionerEmail, setCommissionerEmail] = useState("");
  const [teamNamesCsv, setTeamNamesCsv] = useState("");
  const [leagueDraftAt, setLeagueDraftAt] = useState<string | null>(null);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [sessionError, setSessionError] = useState("");

  const apiBase = useMemo(() => {
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  }, []);

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${accessToken}`,
    }),
    [accessToken],
  );

  const authJsonHeaders = useMemo(
    () => ({
      ...authHeaders,
      "Content-Type": "application/json",
    }),
    [authHeaders],
  );

  const fetchSession = async () => {
    const res = await fetch(`${apiBase}/api/leagues/${leagueId}/draft-session`, {
      cache: "no-store",
      headers: authHeaders,
    });
    if (res.status === 403) {
      throw new Error("forbidden");
    }
    if (!res.ok) {
      throw new Error("Failed to fetch draft session");
    }
    const data = (await res.json()) as DraftSession;
    setPlayers(data.players);
    setTeams(data.teams);
    setAllTrades(data.trades);
    setLeagueName(data.league.name);
    setLeagueDraftAt(data.league.draft_scheduled_at ?? null);
  };

  const wsDraftUrl = useMemo(() => {
    const proto =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss"
        : "ws";
    const u = new URL(apiBase);
    const qs = new URLSearchParams({ token: accessToken });
    return `${proto}://${u.host}/ws/draft/${leagueId}?${qs.toString()}`;
  }, [apiBase, leagueId, accessToken]);

  const wsTradesUrl = useMemo(() => {
    const proto =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss"
        : "ws";
    const u = new URL(apiBase);
    const qs = new URLSearchParams({ token: accessToken });
    return `${proto}://${u.host}/ws/trades/${leagueId}?${qs.toString()}`;
  }, [apiBase, leagueId, accessToken]);

  useEffect(() => {
    setSessionError("");
    fetchSession().catch((err: unknown) => {
      if (err instanceof Error && err.message === "forbidden") {
        setSessionError("You do not have access to this league.");
      } else {
        setSessionError("Could not load draft session data.");
      }
    });
  }, [apiBase, leagueId, authHeaders]);

  useEffect(() => {
    const run = async () => {
      const res = await fetch(`${apiBase}/api/me/leagues`, {
        headers: authHeaders,
        cache: "no-store",
      });
      if (!res.ok) return;
      const rows = (await res.json()) as { id: string; is_commissioner: boolean }[];
      const row = rows.find((r) => r.id === leagueId);
      setIsCommissioner(Boolean(row?.is_commissioner));
    };
    void run();
  }, [apiBase, leagueId, authHeaders]);

  useEffect(() => {
    const d = new WebSocket(wsDraftUrl);
    d.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (payload.type === "draft_event") {
          setPicks((prev) => [
            ...prev,
            {
            id: crypto.randomUUID(),
            round: Number(payload.round ?? 1),
            overall: Number(payload.overall ?? 1),
            teamName: String(payload.team ?? "Team"),
            playerName: String(payload.player ?? "Player"),
            at: new Date().toISOString(),
            },
          ]);
        }
      } catch {
        /* ignore malformed */
      }
    };
    return () => d.close();
  }, [wsDraftUrl]);

  useEffect(() => {
    const t = new WebSocket(wsTradesUrl);
    t.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (payload.type === "trade_event") {
          setTrades((prev) => [
            ...prev,
            {
            id: crypto.randomUUID(),
            summary: String(payload.summary ?? "Trade proposed"),
            at: new Date().toISOString(),
            },
          ]);
        }
      } catch {
        /* ignore */
      }
    };
    return () => t.close();
  }, [wsTradesUrl]);

  const onCsvSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    setUploadMessage("Uploading...");

    const res = await fetch(`${apiBase}/api/players/bulk-upload-csv`, {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });
    if (!res.ok) {
      setUploadMessage("Upload failed. Check CSV format.");
      return;
    }

    const result = (await res.json()) as {
      created: number;
      updated: number;
      skipped: number;
    };
    setUploadMessage(
      `Upload complete. Created ${result.created}, updated ${result.updated}, skipped ${result.skipped}.`,
    );
    await fetchSession();
  };

  const saveTeamDraftOrder = async () => {
    const payload = {
      team_updates: teams.map((team) => ({
        id: team.id,
        draft_position: team.draft_position,
      })),
    };
    const res = await fetch(`${apiBase}/api/leagues/${leagueId}/draft-session`, {
      method: "PUT",
      headers: authJsonHeaders,
      body: JSON.stringify(payload),
    });
    setSessionMessage(
      res.ok ? "Draft order saved." : "Failed to save draft order.",
    );
  };

  const approveTrade = async (tradeId: string) => {
    const res = await fetch(
      `${apiBase}/api/leagues/${leagueId}/commissioner/trades/${tradeId}/approve`,
      { method: "PUT", headers: authHeaders },
    );
    if (!res.ok) {
      setCommissionerMessage("Could not approve trade.");
      return;
    }
    setCommissionerMessage("Trade approved by commissioner.");
    await fetchSession();
  };

  const createLeague = async () => {
    const teamNames = teamNamesCsv
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const res = await fetch(`${apiBase}/api/commissioner/leagues/quick-create`, {
      method: "POST",
      headers: authJsonHeaders,
      body: JSON.stringify({
        league_name: newLeagueName,
        commissioner_display_name: commissionerDisplayName,
        commissioner_email: commissionerEmail,
        team_names: teamNames,
      }),
    });
    if (!res.ok) {
      setCommissionerMessage("League creation failed. Check slug/team list.");
      return;
    }
    const created = (await res.json()) as { league_id: string };
    setCommissionerMessage(
      `League created (${created.league_id}). Update app leagueId to manage it.`,
    );
  };

  const exportDraftResults = async () => {
    const res = await fetch(
      `${apiBase}/api/leagues/${leagueId}/commissioner/export/draft-results.csv`,
      { headers: authHeaders },
    );
    if (!res.ok) {
      setCommissionerMessage("Export failed (commissioner access required).");
      return;
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${leagueName.replace(/\s+/g, "-").toLowerCase()}-draft-results.csv`;
    a.click();
    URL.revokeObjectURL(href);
    setCommissionerMessage("Draft results downloaded.");
  };

  const scheduleDraft = async () => {
    setScheduleMessage("");
    if (!scheduleLocal) {
      setScheduleMessage("Pick a date and time first.");
      return;
    }
    const res = await fetch(`${apiBase}/api/leagues/${leagueId}/commissioner/schedule-draft`, {
      method: "PUT",
      headers: authJsonHeaders,
      body: JSON.stringify({
        draft_scheduled_at: new Date(scheduleLocal).toISOString(),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = (err as { detail?: string }).detail;
      setScheduleMessage(typeof detail === "string" ? detail : "Could not schedule draft.");
      return;
    }
    const league = (await res.json()) as { draft_scheduled_at: string | null };
    setLeagueDraftAt(league.draft_scheduled_at);
    setScheduleMessage("Draft time saved.");
    await fetchSession();
  };

  const tabButton = (key: TabKey, label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(key);
      }}
      className={clsx(
        "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
        tab === key ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-slate-200",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950">
      <header className="border-b border-slate-800/80 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link href="/" className="mb-1 inline-block text-xs text-sky-400 hover:text-sky-300">
              ← Your leagues
            </Link>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">League draft</p>
            <h1 className="text-lg font-semibold text-white">{leagueName}</h1>
          </div>
          <div className="text-right text-xs text-slate-400">
            <p>{teams.length} teams</p>
            {leagueDraftAt ? (
              <p className="mt-1 text-sky-300">Draft: {new Date(leagueDraftAt).toLocaleString()}</p>
            ) : (
              <p className="mt-1 text-slate-500">No draft scheduled</p>
            )}
          </div>
        </div>
      </header>

      {/* Desktop / tablet tab row */}
      <div className="hidden gap-2 border-b border-slate-800/80 px-3 py-2 md:flex">{tabButton("board", "Draft board")}{tabButton("players", "Players")}{tabButton("trades", "Trades")}{tabButton("commissioner", "Commissioner")}</div>

      {/* Mobile tabs */}
      <div className="flex gap-2 border-b border-slate-800/80 bg-slate-900/40 px-3 py-2 md:hidden">
        {tabButton("board", "Board")}
        {tabButton("players", "Players")}
        {tabButton("trades", "Trades")}
        {tabButton("commissioner", "Commish")}
      </div>

      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        {sessionError ? (
          <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {sessionError}
          </p>
        ) : null}
        {tab === "board" ? (
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">Draft board</h2>
            <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Team draft order
              </p>
              <ul className="space-y-2">
                {teams.map((team) => (
                  <li key={team.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-300">{team.name}</span>
                    <input
                      type="number"
                      min={1}
                      value={team.draft_position ?? ""}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setTeams((prev) =>
                          prev.map((item) =>
                            item.id === team.id
                              ? {
                                  ...item,
                                  draft_position: Number.isNaN(next) ? null : next,
                                }
                              : item,
                          ),
                        );
                      }}
                      className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveTeamDraftOrder}
                  className="rounded-md bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600"
                >
                  Save draft order
                </button>
                {sessionMessage ? <p className="text-xs text-slate-400">{sessionMessage}</p> : null}
              </div>
            </div>
            <ul className="space-y-3">
              {picks.length === 0 ? (
                <li className="text-sm text-slate-500">Waiting for picks from the websocket…</li>
              ) : (
                picks.map((p) => (
                  <li key={p.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-white">
                        #{p.overall} · R{p.round}
                      </p>
                      <p className="text-xs text-slate-500">{p.at}</p>
                    </div>
                    <p className="text-sm text-slate-300">{p.playerName}</p>
                    <p className="text-xs text-slate-500">{p.teamName}</p>
                  </li>
                ))
              )}
            </ul>
          </section>
        ) : null}

        {tab === "players" ? (
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">Player list</h2>
            <label className="mb-3 block text-xs text-slate-400">
              Bulk upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={onCsvSelected}
                className="mt-1 block w-full text-xs text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-sky-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-sky-600"
              />
            </label>
            {uploadMessage ? <p className="mb-3 text-xs text-slate-400">{uploadMessage}</p> : null}
            <ul className="space-y-2">
              {players.length === 0 ? (
                <li className="text-sm text-slate-500">No players loaded yet.</li>
              ) : (
                players.map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-sm"
                  >
                    <span className="text-slate-200">{player.full_name}</span>
                    <span className="text-xs text-slate-400">
                      {player.position} {player.nfl_team ? `· ${player.nfl_team}` : ""}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>
        ) : null}

        {tab === "trades" ? (
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">Public trade feed</h2>
            <ul className="space-y-3">
              {trades.length === 0 ? (
                <li className="text-sm text-slate-500">Listening for trade broadcasts…</li>
              ) : (
                trades.map((t) => (
                  <li key={t.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
                    <div className="flex items-baseline justify-between gap-3">
                      <p>{t.summary}</p>
                      <p className="text-xs text-slate-500">{t.at}</p>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        ) : null}

        {tab === "commissioner" ? (
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">
              Commissioner God Mode
            </h2>
            <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Quick create league
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                <input
                  value={newLeagueName}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  placeholder="League name"
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100"
                />
                <input
                  value={commissionerDisplayName}
                  onChange={(e) => setCommissionerDisplayName(e.target.value)}
                  placeholder="Commissioner First Name Last Name"
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100"
                />
                <input
                  value={commissionerEmail}
                  onChange={(e) => setCommissionerEmail(e.target.value)}
                  placeholder="commissioner@example.com"
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100"
                />
                <input
                  value={teamNamesCsv}
                  onChange={(e) => setTeamNamesCsv(e.target.value)}
                  placeholder="Team A, Team B, Team C"
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={createLeague}
                className="mt-3 rounded-md bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600"
              >
                Create league
              </button>
            </div>

            {isCommissioner ? (
              <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Schedule draft (future)
                </p>
                <p className="mb-2 text-xs text-slate-500">
                  Sets the league&apos;s draft time in the database. Must be in the future (local time is converted to
                  UTC automatically).
                </p>
                <input
                  type="datetime-local"
                  value={scheduleLocal}
                  onChange={(e) => setScheduleLocal(e.target.value)}
                  className="w-full max-w-xs rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => void scheduleDraft()}
                  className="ml-0 mt-3 block rounded-md bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 md:ml-3 md:mt-0 md:inline-block"
                >
                  Save draft schedule
                </button>
                {scheduleMessage ? <p className="mt-2 text-xs text-slate-400">{scheduleMessage}</p> : null}
              </div>
            ) : null}

            <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Trade approvals
              </p>
              <ul className="space-y-2">
                {allTrades.filter((trade) => trade.status === "accepted").length === 0 ? (
                  <li className="text-sm text-slate-500">No accepted trades awaiting approval.</li>
                ) : (
                  allTrades
                    .filter((trade) => trade.status === "accepted")
                    .map((trade) => (
                      <li
                        key={trade.id}
                        className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-3 py-2"
                      >
                        <span className="text-xs text-slate-300">{trade.message ?? trade.id}</span>
                        <button
                          type="button"
                          onClick={() => approveTrade(trade.id)}
                          className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
                        >
                          Approve
                        </button>
                      </li>
                    ))
                )}
              </ul>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Export tools
              </p>
              <button
                type="button"
                onClick={() => void exportDraftResults()}
                className="rounded-md bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-600"
              >
                Export draft results CSV
              </button>
            </div>
            {commissionerMessage ? (
              <p className="mt-3 text-xs text-slate-400">{commissionerMessage}</p>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
