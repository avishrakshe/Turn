"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TurnMark } from "@/components/ring/TurnMark";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stat } from "@/components/ui/Stat";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";
import { useProfile } from "@/lib/live/hooks";
import { useSession } from "@/lib/live/session";

/** Your Turn Score, as the Envio indexer computes it from your payments onchain (the same TrustMath the contracts use). */
export function ScoreScreen() {
  const t = useT();
  const toast = useToast();
  const { address } = useSession();
  const profile = useProfile(address);
  const m = profile.data?.Member[0];
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const payments = m ? m.paymentsOnTime + m.paymentsLate + m.defaults : 0;
  const pct = m ? Math.round(m.onTimeRateBps / 100) : 0;
  const score = m?.creditScore ?? 0;
  const verifyUrl = `${origin}/api/credit/${address ?? ""}`;
  const verifyLabel = `${origin.replace(/^https?:\/\//, "")}/api/credit/${address?.slice(0, 6)}…${address?.slice(-4)}`;
  const line = t("score.cardLine", { circles: t("score.circlesWord", { count: m?.circlesJoined ?? 0 }), pct });

  async function share() {
    const text = `${t("score.title")} ${score} · ${line} · ${verifyUrl}`;
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
            {m && <span className="ms-auto text-xs font-medium opacity-80">{m.trustLevel}</span>}
          </div>
          <p className="font-display tabular mt-auto text-7xl leading-none" data-testid="score">
            {profile.isLoading ? <Skeleton className="h-16 w-32" /> : score}
          </p>
          <figcaption className="mt-2 text-sm font-medium opacity-90">{payments ? line : t("score.none")}</figcaption>
        </div>
      </figure>

      <dl className="grid grid-cols-2 gap-6">
        <Stat label={t("score.circlesJoined")} value={m?.circlesJoined ?? 0} />
        <Stat label={t("score.circlesCompleted")} value={m?.circlesCompleted ?? 0} />
        <Stat label={t("score.onTime")} value={m?.paymentsOnTime ?? 0} />
        <Stat label={t("score.missed")} value={m?.defaults ?? 0} />
      </dl>

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={share}>
          {t("score.share")}
        </Button>
        <p className="text-ink-muted text-sm">
          {t("score.verify", { url: "" })}
          <a href={verifyUrl} target="_blank" rel="noopener noreferrer" className="text-teal-ink font-mono text-xs break-all underline-offset-4 hover:underline">
            {verifyLabel}
          </a>
        </p>
        <p className="text-ink-muted text-xs">{t("live.scoreSource")}</p>
      </div>
      <Link href="/docs/turn-score" className="text-teal-ink min-h-11 font-semibold underline underline-offset-4">
        {t("score.how")}
      </Link>
    </div>
  );
}
