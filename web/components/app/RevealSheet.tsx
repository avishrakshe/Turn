"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useMoney } from "@/lib/app/hooks";
import { memberName, payoutOf } from "@/lib/app/selectors";
import { type CircleRec, store, YOU } from "@/lib/app/store";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { Celebration } from "./Celebration";

/** The reveal moment after bidding closes: bids open one by one, then the winner. */
export function RevealSheet({ circle: c }: { circle: CircleRec }) {
  const t = useT();
  const { fmt } = useMoney();
  const log = c.history.find((h) => h.round === c.reveal);
  const closed = log?.events.find((e) => e.type === "AuctionClosed");
  const payout = log ? payoutOf(log.events) : undefined;
  const bids = closed?.type === "AuctionClosed" ? closed.revealed.filter((b) => b.valid) : [];
  const [shown, setShown] = useState(0);
  const open = c.reveal !== null && !!payout;
  const youWon = payout?.winner === YOU;
  const done = shown >= bids.length;

  // Open the sealed bids one at a time, so the moment reads as a reveal.
  useEffect(() => {
    if (!open) return setShown(0);
    if (shown >= bids.length) return;
    const id = window.setTimeout(() => setShown((s) => s + 1), 550);
    return () => window.clearTimeout(id);
  }, [open, shown, bids.length]);

  if (!payout) return null;
  return (
    <>
      {open && done && youWon && <Celebration />}
      <Sheet
        open={open}
        onClose={() => store.dismissReveal(c.id)}
        title={youWon && done ? t("celebrate.title") : t("reveal.title")}
        description={t("reveal.subtitle", { round: payout.round })}
        footer={
          <Button size="lg" onClick={() => store.dismissReveal(c.id)}>
            {t("reveal.ok")}
          </Button>
        }
      >
        <div aria-live="polite" className="flex flex-col gap-2">
          {bids.length === 0 && <p className="text-ink-muted">{t("reveal.noBids", { name: memberName(c, payout.winner) })}</p>}
          {bids.slice(0, shown).map((b) => {
            const winner = b.member === payout.winner;
            return (
              <div
                key={b.member}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-3 transition-colors",
                  winner && done ? "bg-marigold-soft border-marigold/50" : "bg-paper-raised border-line",
                )}
              >
                <Avatar name={memberName(c, b.member)} size={36} turn={winner && done} />
                <p className="flex-1 font-semibold">
                  {memberName(c, b.member)} <span className="text-ink-muted font-normal">{t("reveal.offered", { pct: b.bps / 100 })}</span>
                </p>
                {winner && done && <Badge tone="turn" dot>{t("reveal.winner")}</Badge>}
              </div>
            );
          })}
          {done && (
            <p className="font-display mt-3 text-2xl">
              {youWon ? t("reveal.youWon") : t("reveal.theyWon", { name: memberName(c, payout.winner) })}
            </p>
          )}
          {done && youWon && <p className="text-ink-muted">{t("celebrate.body", { amount: fmt(payout.netPaid) })}</p>}
        </div>
      </Sheet>
    </>
  );
}
