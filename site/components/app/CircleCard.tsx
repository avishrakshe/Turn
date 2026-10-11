"use client";

import Link from "next/link";
import { ProgressRing } from "@/components/ring/ProgressRing";
import { Badge } from "@/components/ui/Badge";
import { useDate, useMoney } from "@/lib/app/hooks";
import { useT } from "@/lib/i18n";
import type { CircleRow, MembershipRow } from "@/lib/live/indexer";
import { useNames } from "@/lib/live/names";

export type Health = "green" | "amber" | "red" | "forming" | "done";

const healthTone: Record<Health, "success" | "warning" | "danger" | "neutral" | "trust"> = {
  green: "success",
  amber: "warning",
  red: "danger",
  forming: "neutral",
  done: "trust",
};

/** The indexer's 0–100 health score (collected vs expected, defaults, reserve use), as a traffic light. */
export function health(c: CircleRow): Health {
  if (c.status === "Forming") return "forming";
  if (c.status === "Completed") return "done";
  return c.healthScore >= 80 ? "green" : c.healthScore >= 50 ? "amber" : "red";
}

/** When the round after this one starts, i.e. the next auto-pay collection (seconds since epoch). */
export const nextCollection = (c: CircleRow) => (c.startTime ? Number(c.startTime) + c.currentRound * c.period : null);

export function circleFallbackName(t: (k: string, v?: Record<string, string | number>) => string, c: Pick<CircleRow, "size">) {
  return t("live.circleOf", { count: c.size });
}

export function CircleCard({ seat, autopay }: { seat: MembershipRow & { circle: CircleRow }; autopay: boolean | null }) {
  const t = useT();
  const { fmt } = useMoney();
  const date = useDate();
  const names = useNames();
  const c = seat.circle;
  const h = health(c);
  const next = nextCollection(c);

  let line: string;
  if (c.status === "Forming") line = t("home.forming", { count: c.size - c.memberCount });
  else if (c.status === "Completed") line = t("home.completed");
  else if (seat.status !== "Active") line = t("live.youLeft");
  else if (next) line = t(c.currentRound >= c.totalRounds ? "home.finalPayment" : "home.nextPayment", { amount: fmt(BigInt(c.contribution)), date: date(new Date(next * 1000)) });
  else line = t("home.roundOf", { round: c.currentRound, total: c.totalRounds });

  return (
    <Link
      href={`/app/circle/${c.id}`}
      className="bg-paper-raised border-line hover:border-line-strong shadow-soft flex items-center gap-4 rounded-card border p-4 transition-colors"
    >
      <ProgressRing round={c.status === "Forming" ? 0 : Math.min(c.currentRound, c.totalRounds)} total={c.status === "Forming" ? c.size : c.totalRounds} size={56}>
        {c.status === "Forming" ? (
          <span className="text-ink-muted text-xs">
            {c.memberCount}/{c.size}
          </span>
        ) : undefined}
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-lg leading-tight">{names.circle(c.id, circleFallbackName(t, c))}</p>
        <p className="text-ink-muted mt-0.5 text-sm">{line}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge tone={healthTone[h]} dot>
            {t(`home.health.${h}`)}
          </Badge>
          {seat.hasWon && <span className="text-marigold-ink text-xs font-semibold">{t("live.receivedRound", { round: seat.wonRound ?? 0 })}</span>}
          {c.status !== "Completed" && seat.status === "Active" && autopay !== null && (
            <span className={autopay ? "text-success text-xs font-semibold" : "text-warning text-xs font-semibold"}>
              {t(autopay ? "home.autopayOn" : "home.autopayOff")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
