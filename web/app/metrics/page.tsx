"use client";

import Link from "next/link";
import { TurnLogo } from "@/components/ring/TurnMark";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { useHydrated, useStore } from "@/lib/app/hooks";
import { translate } from "@/lib/i18n";

const t = (k: string) => translate("en", k);

/** Onboarding speed, measured: time and taps from first opening the app to the first confirmation. */
export default function MetricsPage() {
  const hydrated = useHydrated();
  const m = useStore((s) => s.metrics);
  const measured = hydrated && m.firstOpenAt && m.firstConfirmedAt;
  const seconds = measured ? (m.firstConfirmedAt! - m.firstOpenAt!) / 1000 : null;

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
        <p className="text-sm font-semibold">{t("metrics.thisBrowser")}</p>
        {seconds === null ? (
          <p className="text-ink-muted">{t("metrics.none")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-6">
            <Stat label={t("metrics.time")} value={`${seconds.toFixed(1)} s`} source={`${t("metrics.target")}: < 10 s`} />
            <Stat label={t("metrics.taps")} value={m.taps} source={`${t("metrics.target")}: < 3`} />
          </dl>
        )}
      </Card>
      <p className="text-ink-muted text-sm">{t("metrics.demoNote")}</p>
    </main>
  );
}
