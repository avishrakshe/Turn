"use client";

import Link from "next/link";
import { ProgressRing } from "@/components/ring/ProgressRing";
import { Badge } from "@/components/ui/Badge";
import { useDate, useMoney } from "@/lib/app/hooks";
import { type Health, health, nextPayment, yourTurn } from "@/lib/app/selectors";
import type { CircleRec } from "@/lib/app/store";
import { useT } from "@/lib/i18n";

const healthTone: Record<Health, "success" | "warning" | "danger" | "neutral" | "trust"> = {
  green: "success",
  amber: "warning",
  red: "danger",
  forming: "neutral",
  done: "trust",
};

export function CircleCard({ circle: c }: { circle: CircleRec }) {
  const t = useT();
  const { fmt } = useMoney();
  const date = useDate();
  const e = c.engine;
  const h = health(c);
  const next = nextPayment(c);
  const turn = yourTurn(c);

  let line: string;
  if (!e) line = t("home.forming", { count: c.n - c.members.length });
  else if (e.status === "COMPLETED") line = t("home.completed");
  else if (next) line = t(next.final ? "home.finalPayment" : "home.nextPayment", { amount: fmt(next.amount), date: date(next.date) });
  else line = t("home.roundOf", { round: Math.min(e.round, e.totalRounds), total: e.totalRounds });

  return (
    <Link
      href={`/app/circle/${c.id}`}
      className="bg-paper-raised border-line hover:border-line-strong shadow-soft flex items-center gap-4 rounded-card border p-4 transition-colors"
    >
      <ProgressRing round={e ? Math.min(e.round, e.totalRounds) : 0} total={e ? e.totalRounds : c.n} size={56} yourTurn={turn === "soon"}>
        {!e ? <span className="text-ink-muted text-xs">{c.members.length}/{c.n}</span> : undefined}
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-lg leading-tight">{c.name}</p>
        <p className="text-ink-muted mt-0.5 text-sm">{line}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge tone={healthTone[h]} dot>
            {t(`home.health.${h}`)}
          </Badge>
          {e && e.status !== "COMPLETED" && (
            <span className={c.autopay ? "text-success text-xs font-semibold" : "text-warning text-xs font-semibold"}>
              {t(c.autopay ? "home.autopayOn" : "home.autopayOff")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
