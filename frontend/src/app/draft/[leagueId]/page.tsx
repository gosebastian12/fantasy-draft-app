"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DraftRoomShell } from "@/components/draft-room";
import { getToken } from "@/lib/session";

export default function DraftLeaguePage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/");
      return;
    }
    setToken(t);
  }, [router]);

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-sm text-slate-400">
        Redirecting…
      </div>
    );
  }

  return <DraftRoomShell leagueId={leagueId} accessToken={token} />;
}
