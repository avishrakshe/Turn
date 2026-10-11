"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TurnLogo } from "@/components/ring/TurnMark";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { translate } from "@/lib/i18n";

const t = (k: string, v?: Record<string, string | number>) => translate("en", k, v);

type Metrics = {
  count: number;
  medianSeconds: number | null;
  medianTaps: number | null;
  medianPrompts: number | null;
  fastestSeconds: number | null;
  persistent: boolean;
  runs: { id: string; flow: string; seconds: number; taps: number; prompts?: number; startedAt: number; passkeyAt?: number; at: number }[];
};

const secs = (s: number | null) => (s == null ? "–" : `${s.toFixed(1)} s`);

/**
 * Onboarding speed, measured on the live app: from first opening Turn to the first confirmed transaction on Monad,
 * with taps and Face ID prompts. Each new account reports its own run once (/api/metrics).
 */
export default function MetricsPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/metrics", { cache: "no-store" })
        .then((r) => r.json() as Promise<Metrics>)
        .then((x) => alive && setM(x))
        .catch(() => alive && setFailed(true));
    void load();
    const id = window.setInterval(load, 10_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-5 py-10">
      <Link href="/" aria-label="Turn home" className="self-start rounded-lg p-1">
        <TurnLogo />
      </Link>
      <div>
        <h1 className="text-4xl">{t("metrics.title")}</h1>
        <p className="text-ink-muted mt-3 text-lg">{t("metrics.lead")}</p>
      </div>
      <Card className="flex flex-col gap-6">
        <p className="text-sm font-semibold">{t("live.metricsLive", { count: m?.count ?? 0 })}</p>
        {failed ? (
          <p className="text-ink-muted">{t("errors.generic")}</p>
        ) : !m || m.count === 0 ? (
          <p className="text-ink-muted">{t("metrics.none")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-6">
            <Stat label={t("metrics.time")} value={secs(m.medianSeconds)} source={`${t("metrics.target")}: < 10 s · ${t("live.fastest")}: ${secs(m.fastestSeconds)}`} />
            <Stat label={t("live.prompts")} value={m.medianPrompts ?? "–"} source={`${t("metrics.target")}: 1`} />
            <Stat label={t("metrics.taps")} value={m.medianTaps ?? "–"} source={`${t("metrics.target")}: < 3`} />
          </dl>
        )}
      </Card>
      {m && m.runs.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-sans text-base font-semibold tracking-normal">{t("live.recentRuns")}</h2>
          <ul className="divide-line flex flex-col divide-y text-sm">
            {m.runs.map((r) => (
              <li key={r.id} className="tabular flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {r.flow} · {new Date(r.at).toLocaleString("en-GB")}
                </span>
                <span>
                  {secs(r.seconds)} · {r.taps} taps{r.prompts != null ? ` · ${r.prompts} Face ID` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-ink-muted text-sm">{t("live.metricsNote")}</p>
      {m && !m.persistent && <p className="text-ink-muted text-xs">{t("live.metricsNotPersistent")}</p>}
    </main>
  );
}
