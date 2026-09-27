"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TurnMark } from "@/components/ring/TurnMark";
import { Button } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Stat";
import { useToast } from "@/components/ui/Toast";
import { useStore } from "@/lib/app/hooks";
import { creditRecord } from "@/lib/app/selectors";
import { score } from "@/lib/economics/trust";
import { useT } from "@/lib/i18n";

export function ScoreScreen() {
  const t = useT();
  const toast = useToast();
  const state = useStore((s) => s);
  const record = useMemo(() => creditRecord(state), [state]);
  const s = score(record);
  const payments = record.paymentsOnTime + record.paymentsLate + record.defaults;
  const pct = payments ? Math.round((record.paymentsOnTime / payments) * 100) : 0;
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const address = state.profile?.address ?? "";
  const verifyUrl = `${origin}/credit/${address}`;
  // Shown shortened; the full link is what gets copied and shared.
  const verifyLabel = `${origin.replace(/^https?:\/\//, "")}/credit/${address.slice(0, 6)}…${address.slice(-4)}`;
  // The card sums up the whole record, so it counts every circle joined (the stats below split them out).
  const line = t("score.cardLine", { circles: t("score.circlesWord", { count: record.circlesJoined }), pct });

  async function share() {
    const text = `${t("score.title")} ${s} · ${line} · ${verifyUrl}`;
    try {
      if (navigator.share) await navigator.share({ title: t("score.title"), text, url: verifyUrl });
      else {
        await navigator.clipboard.writeText(text);
        toast({ tone: "success", title: t("score.shared") });
      }
    } catch {
      // The share sheet was dismissed; nothing to do.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">{t("score.title")}</h1>
        <p className="text-ink-muted mt-1">{t("score.lead")}</p>
      </div>

      <figure className="bg-teal text-on-teal shadow-lift relative aspect-[1.6/1] overflow-hidden rounded-[1.6rem] p-6">
        {/* Opacity on the stroke, not the element: an opacity layer inside a rounded clip shows a hard-edged box in Chrome. */}
        <svg aria-hidden viewBox="0 0 200 200" className="absolute -end-16 -top-16 size-64">
          <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
          <circle cx="100" cy="100" r="46" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.5" />
        </svg>
        <div className="relative flex h-full flex-col">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="bg-paper grid size-8 place-items-center rounded-full">
              <TurnMark size={22} />
            </span>
            {t("score.title")}
          </div>
          <p className="font-display tabular mt-auto text-7xl leading-none">{s}</p>
          <figcaption className="mt-2 text-sm font-medium opacity-90">{payments ? line : t("score.none")}</figcaption>
        </div>
      </figure>

      <dl className="grid grid-cols-2 gap-6">
        <Stat label={t("score.circlesJoined")} value={record.circlesJoined} />
        <Stat label={t("score.circlesCompleted")} value={record.circlesCompleted} />
        <Stat label={t("score.onTime")} value={record.paymentsOnTime} />
        <Stat label={t("score.missed")} value={record.defaults} />
      </dl>

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={share}>
          {t("score.share")}
        </Button>
        <p className="text-ink-muted text-sm">{t("score.verify", { url: verifyLabel })}</p>
        <p className="text-ink-muted text-xs">{t("score.demoNote")}</p>
      </div>
      <Link href="/docs/turn-score" className="text-teal-ink min-h-11 font-semibold underline underline-offset-4">
        {t("score.how")}
      </Link>
    </div>
  );
}
