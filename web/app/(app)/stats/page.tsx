"use client";
// Network analytics, straight from the Envio index: totals, on-time rate, and money moving between currencies.
import { useQuery } from "@tanstack/react-query";
import { usePrefs } from "@/components/providers";
import { Card, Screen, Stat } from "@/components/ui";
import { networkStats } from "@/lib/indexer";
import { fmt } from "@/lib/money";

export default function Stats() {
  const { currency, rates } = usePrefs();
  const q = useQuery({ queryKey: ["stats"], queryFn: networkStats, refetchInterval: 5_000 });
  const g = q.data?.GlobalStats[0];
  const corridors = q.data?.CorridorStats ?? [];
  const max = corridors.reduce((m, c) => (BigInt(c.volume) > m ? BigInt(c.volume) : m), 1n);
  return (
    <Screen title="Turn, live" back="/" nav={false}>
      {!g ? (
        <p className="text-muted">{q.isLoading ? "Loading…" : "No activity yet."}</p>
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-5">
            <Stat label="Saved through Turn" value={fmt(g.totalSaved, currency, rates)} />
            <Stat label="Paid out to members" value={fmt(g.totalPaidOut, currency, rates)} />
            <Stat label="Circles" value={g.circlesCreated} hint={`${g.circlesActive} running · ${g.circlesCompleted} complete`} />
            <Stat label="Members" value={g.members} />
            <Stat label="Paid on time" value={`${(g.onTimeRateBps / 100).toFixed(1)}%`} hint={`${g.paymentsOnTime} on time · ${g.defaults} covered`} />
            <Stat label="Auto-pay switched on" value={g.activeSessions} />
          </Card>
          <Card>
            <h2 className="font-extrabold">Across borders</h2>
            <p className="mb-4 text-sm text-muted">{fmt(g.crossBorderVolume, currency, rates)} moved between countries, settled instantly.</p>
            <ul className="flex flex-col gap-3">
              {corridors.map((c) => (
                <li key={c.id}>
                  <div className="flex justify-between text-sm font-semibold">
                    <span>
                      {c.fromCurrency} → {c.toCurrency} {c.crossBorder ? "🌍" : ""}
                    </span>
                    <span className="num">{fmt(c.volume, currency, rates)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-2">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Number((BigInt(c.volume) * 100n) / max)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-center text-xs text-muted">Indexed with Envio HyperIndex on Monad.</p>
        </>
      )}
    </Screen>
  );
}
