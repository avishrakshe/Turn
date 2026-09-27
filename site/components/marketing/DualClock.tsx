"use client";

import { useEffect, useState } from "react";
import { CITY, partnerZone } from "@/lib/visitor";

/** "It's 21:14 in Dubai · 22:44 in Mumbai": the visitor's time and the other end of the corridor. */
export function DualClock() {
  const [now, setNow] = useState<Date | null>(null);
  const [zone, setZone] = useState("Asia/Dubai");

  useEffect(() => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setNow(new Date());
    // Tick on the minute boundary.
    let id = 0;
    const tick = () => {
      setNow(new Date());
      id = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    id = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    return () => window.clearTimeout(id);
  }, []);

  const partner = partnerZone(zone);
  const time = (tz: string) =>
    now ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(now) : "--:--";
  const here = CITY[zone];

  return (
    <p className="text-ink-muted tabular flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="bg-marigold size-2 rounded-full" aria-hidden />
      <span>
        It&rsquo;s <time className="text-ink font-semibold">{time(zone)}</time> {here ? `in ${here}` : "where you are"}
      </span>
      <span aria-hidden>·</span>
      <span>
        <time className="text-ink font-semibold">{time(partner)}</time> in {CITY[partner]}
      </span>
    </p>
  );
}
