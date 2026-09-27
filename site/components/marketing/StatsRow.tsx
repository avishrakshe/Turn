"use client";

import { useEffect, useState } from "react";
import { Stat } from "@/components/ui/Stat";
import type { Rates } from "@/lib/fx";
import { type DisplayCurrency, formatMoney } from "@/lib/money";
import type { LiveStats } from "@/lib/stats";
import { guessCurrency } from "@/lib/visitor";

export function StatsRow({ stats, rates }: { stats: LiveStats; rates: Rates }) {
  // Server renders USD; the browser switches to the visitor's currency when a rate is known.
  const [currency, setCurrency] = useState<DisplayCurrency>("USD");
  useEffect(() => {
    const guess = guessCurrency(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language);
    if (rates[guess]) setCurrency(guess);
  }, [rates]);

  const saved = stats.totalSavedUsd * (rates[currency] ?? 1);
  const source = `on ${stats.network}`;

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
      <Stat label="circles running" value={stats.circlesActive.toLocaleString()} source={source} />
      <Stat
        label="total saved"
        value={formatMoney(Math.round(saved), currency, { fractionDigits: 0 })}
        source={currency === "USD" ? source : `${source} · converted at today's rate`}
      />
      <Stat
        label="payments on time"
        value={stats.onTimeRate === null ? "—" : `${Math.round(stats.onTimeRate * 1000) / 10}%`}
        source={source}
      />
      <Stat
        label="average payout time"
        value={stats.avgPayoutSeconds === null ? "—" : `${stats.avgPayoutSeconds.toFixed(1)} s`}
        source={source}
      />
    </dl>
  );
}
