"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { useDraftBoardStore } from "@/lib/draft-store";

type TabKey = "board" | "players" | "trades";

export function DraftRoomShell({ leagueId }: { leagueId: string }) {
  const [tab, setTab] = useState<TabKey>("board");
  const picks = useDraftBoardStore((s) => s.picks);
  const trades = useDraftBoardStore((s) => s.trades);
  const appendPick = useDraftBoardStore((s) => s.appendPick);
  const appendTrade = useDraftBoardStore((s) => s.appendTrade);

  const apiBase = useMemo(() => {
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  }, []);

  const wsDraftUrl = useMemo(() => {
    const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
    const u = new URL(apiBase);
    return `${proto}://${u.host}/ws/draft/${leagueId}`;
  }, [apiBase, leagueId]);

  const wsTradesUrl = useMemo(() => {
    const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
    const u = new URL(apiBase);
    return `${proto}://${u.host}/ws/trades/${leagueId}`;
  }, [apiBase, leagueId]);

  useEffect(() => {
    const d = new WebSocket(wsDraftUrl);
    d.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (payload.type === "draft_event") {
          appendPick({
            id: crypto.randomUUID(),
            round: Number(payload.round ?? 1),
            overall: Number(payload.overall ?? 1),
            teamName: String(payload.team ?? "Team"),
            playerName: String(payload.player ?? "Player"),
            at: new Date().toISOString(),
          });
        }
      } catch {
        /* ignore malformed */
      }
    };
    return () => d.close();
  }, [appendPick, wsDraftUrl]);

  useEffect(() => {
    const t = new WebSocket(wsTradesUrl);
    t.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (payload.type === "trade_event") {
          appendTrade({
            id: crypto.randomUUID(),
            summary: String(payload.summary ?? "Trade proposed"),
            at: new Date().toISOString(),
          });
        }
      } catch {
        /* ignore */
      }
    };
    return () => t.close();
  }, [appendTrade, wsTradesUrl]);

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
            <h1 className="text-lg font-semibold text-white">Live room</h1>
          </div>
        </div>
      </header>

      {/* Desktop / tablet tab row */}
      <div className="hidden gap-2 border-b border-slate-800/80 px-3 py-2 md:flex">{tabButton("board", "Draft board")}{tabButton("players", "Players")}{tabButton("trades", "Trades")}</div>

      {/* Mobile tabs */}
      <div className="flex gap-2 border-b border-slate-800/80 bg-slate-900/40 px-3 py-2 md:hidden">
        {tabButton("board", "Board")}
        {tabButton("players", "Players")}
        {tabButton("trades", "Trades")}
      </div>

      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        {tab === "board" ? (
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">Draft board</h2>
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
            <p className="text-sm text-slate-400">
              Hook your rankings query here. This shell is mobile-first and ready for virtualization.
            </p>
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
      </main>
    </div>
  );
}
