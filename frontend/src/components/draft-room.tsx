"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
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
  league: { id: string; name: string; slug: string };
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

export function DraftRoomShell({ leagueId }: { leagueId: string }) {
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

  const apiBase = useMemo(() => {
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  }, []);

  const fetchSession = async () => {
    const res = await fetch(`${apiBase}/api/leagues/${leagueId}/draft-session`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("Failed to fetch draft session");
    }
    const data = (await res.json()) as DraftSession;
    setPlayers(data.players);
    setTeams(data.teams);
    setAllTrades(data.trades);
    setLeagueName(data.league.name);
  };

  const wsDraftUrl = useMemo(() => {
    const proto =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss"
        : "ws";
    const u = new URL(apiBase);
    return `${proto}://${u.host}/ws/draft/${leagueId}`;
  }, [apiBase, leagueId]);

  const wsTradesUrl = useMemo(() => {
    const proto =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss"
        : "ws";
    const u = new URL(apiBase);
    return `${proto}://${u.host}/ws/trades/${leagueId}`;
  }, [apiBase, leagueId]);

  useEffect(() => {
    fetchSession().catch(() => {
      setUploadMessage("Could not load draft session data.");
    });
  }, [apiBase, leagueId]);

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSessionMessage(
      res.ok ? "Draft order saved." : "Failed to save draft order.",
    );
  };

  const approveTrade = async (tradeId: string) => {
    const res = await fetch(
      `${apiBase}/api/leagues/${leagueId}/commissioner/trades/${tradeId}/approve`,
      { method: "PUT" },
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
      headers: { "Content-Type": "application/json" },
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

  const exportDraftResults = () => {
    const url = `${apiBase}/api/leagues/${leagueId}/commissioner/export/draft-results.csv`;
    window.open(url, "_blank");
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
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">League draft</p>
            <h1 className="text-lg font-semibold text-white">{leagueName}</h1>
          </div>
          <p className="text-xs text-slate-400">{teams.length} teams</p>
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
                onClick={exportDraftResults}
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
