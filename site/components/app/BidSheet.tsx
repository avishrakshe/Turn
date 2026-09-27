"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useMoney } from "@/lib/app/hooks";
import { type CircleRec, store, YOU } from "@/lib/app/store";
import { activeMembers, BPS, maxBidBps, potFor, withheldIfWinningIn } from "@/lib/economics/engine";
import { useT } from "@/lib/i18n";
import { useApp } from "./AppProvider";

const STEP = 50; // bids move in 0.5% steps

/**
 * Seal a bid. Shows exactly what happens if it wins before anything is signed. Bids above 10%
 * need Face ID; smaller ones use the in-memory session (plan.md §6).
 */
export function BidSheet({ circle: c, open, onClose }: { circle: CircleRec; open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const { passkey } = useApp();
  const { fmt } = useMoney();
  const e = c.engine!;
  const cap = maxBidBps(e, YOU);
  const [bps, setBps] = useState(Math.min(cap, e.bids[YOU] ?? 300));
  const pot = potFor(e);
  const discount = (pot * BigInt(bps)) / BPS;
  const toReserve = (discount * BigInt(e.params.reserveBps)) / BPS;
  const others = activeMembers(e).length - 1;
  const each = others > 0 ? (discount - toReserve) / BigInt(others) : 0n;
  const held = withheldIfWinningIn(e, YOU, e.round);
  const now = pot - discount - held;

  async function seal() {
    if (bps > 1000 && !(await passkey(t("bid.passkeySummary", { pct: bps / 100 })))) return;
    store.sealBid(c.id, bps);
    toast({ tone: "success", title: t("bid.sealed"), description: t("bid.sealedToast") });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("bid.title")}
      description={t("bid.body", { pot: fmt(pot) })}
      footer={
        <>
          <Button size="lg" onClick={seal} disabled={bps < STEP}>
            {t("bid.confirm")}
          </Button>
          <p className="text-ink-muted text-center text-xs">{t("bid.sealedNote")}</p>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="bid-range" className="flex items-baseline justify-between text-sm font-semibold">
            {t("bid.discount")}
            <span className="tabular font-display text-3xl">
              {bps / 100}% <span className="text-ink-muted font-sans text-base">· {fmt(discount)}</span>
            </span>
          </label>
          <input
            id="bid-range"
            type="range"
            min={STEP}
            max={Math.max(STEP, cap)}
            step={STEP}
            value={bps}
            onChange={(ev) => setBps(Number(ev.target.value))}
            aria-valuetext={`${bps / 100}%, ${fmt(discount)}`}
            className="accent-marigold h-11 w-full"
          />
          {bps > 1000 && <p className="text-ink-muted text-xs">{t("bid.bigBid")}</p>}
        </div>
        <div className="bg-paper-sunk flex flex-col gap-1 rounded-2xl p-4 text-sm leading-relaxed">
          <p>
            <span className="font-semibold">{t("bid.youGet", { now: fmt(now) })}</span>
            {held > 0n && <> {t("bid.held", { held: fmt(held) })}</>}.
          </p>
          <p className="text-ink-muted">{t("bid.shared", { each: fmt(each), count: others })}</p>
        </div>
      </div>
    </Sheet>
  );
}
