"use client";
// Public savings record ("proof link"): anyone with the link can see it. Read from Envio, not raw RPC.
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { getAddress, isAddress } from "viem";
import { usePrefs } from "@/components/providers";
import { Card, Notice, Pill, Screen, Stat } from "@/components/ui";
import { memberProfile } from "@/lib/indexer";
import { fmt, shortAddr } from "@/lib/money";
import { useSession } from "@/lib/session";

export default function CreditPage() {
  const { address: raw } = useParams<{ address: string }>();
  const addr = isAddress(raw) ? getAddress(raw) : null;
  const { address } = useSession();
  const { currency, rates } = usePrefs();
  const [copied, setCopied] = useState(false);
  const q = useQuery({ queryKey: ["credit", addr], queryFn: () => memberProfile(addr!), enabled: Boolean(addr), refetchInterval: 10_000 });
  const mine = address && addr && address === addr;

  if (!addr) return <Screen title="Savings record" back="/"><Notice tone="bad">That link isn't right.</Notice></Screen>;
  const m = q.data?.Member[0];
  const score = m?.creditScore ?? 0;

  return (
    <Screen title={mine ? "My savings record" : "Savings record"} back={mine ? "/home" : "/"} nav={Boolean(mine)}>
      <Card className="flex flex-col items-center gap-3 text-center">
        <Gauge score={score} />
        <Pill tone={m && m.circlesCompleted > 0 ? "good" : "neutral"}>{m?.trustLevel ?? "New"}</Pill>
        <p className="text-sm text-muted">{mine ? "Your" : `${shortAddr(addr)}'s`} record on Turn, built from real payments. It can't be edited by anyone.</p>
      </Card>

      {q.isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : !m ? (
        <Notice>No savings history yet.</Notice>
      ) : (
        <Card className="grid grid-cols-2 gap-5">
          <Stat label="Circles completed" value={m.circlesCompleted} />
          <Stat label="On-time payments" value={`${(m.onTimeRateBps / 100).toFixed(0)}%`} hint={`${m.paymentsOnTime} of ${m.paymentsOnTime + m.paymentsLate + m.defaults}`} />
          <Stat label="Saved so far" value={fmt(m.totalContributed, currency, rates)} />
          <Stat label="Missed payments" value={m.defaults} />
          <Stat label="Trust" value={`${(m.trustBps / 100).toFixed(0)}%`} hint="less money held back when you receive early" />
          <Stat label="Active circles" value={m.circlesActive} />
        </Card>
      )}

      {mine && (
        <button
          className="min-h-12 rounded-2xl bg-primary font-bold text-primary-ink"
          onClick={async () => {
            const url = `${window.location.origin}/credit/${addr}`;
            if (navigator.share) {
              try {
                await navigator.share({ title: "My Turn savings record", url });
                return;
              } catch {}
            }
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Link copied ✓" : "Share my record"}
        </button>
      )}
      <p className="text-center text-xs text-muted">Also available as JSON: /api/credit/{addr}</p>
    </Screen>
  );
}

function Gauge({ score }: { score: number }) {
  const pct = Math.min(1, score / 1000);
  const r = 52;
  const c = Math.PI * r;
  return (
    <svg width="150" height="90" viewBox="0 0 130 78" role="img" aria-label={`Score ${score} out of 1000`}>
      <path d="M13 70 A52 52 0 0 1 117 70" fill="none" stroke="var(--surface-2)" strokeWidth="12" strokeLinecap="round" />
      <path d="M13 70 A52 52 0 0 1 117 70" fill="none" stroke="var(--primary)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      <text x="65" y="62" textAnchor="middle" className="num" fontSize="24" fontWeight="800" fill="var(--ink)">
        {score}
      </text>
      <text x="65" y="76" textAnchor="middle" fontSize="8" fill="var(--muted)">
        of 1000
      </text>
    </svg>
  );
}
