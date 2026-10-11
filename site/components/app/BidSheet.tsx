"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useMoney } from "@/lib/app/hooks";
import { useT } from "@/lib/i18n";
import { QUICK_BID_BPS } from "@/lib/live/session";

/**
 * Offer a discount for this round's pot. Bids are open onchain: everyone sees the best offer, and a new one must beat
 * it. The highest offer when bidding closes wins; the discount goes to the others as money off their next payment.
 */
export function BidSheet({
  open,
  onClose,
  pot,
  maxBps,
  bestBps,
  others,
  closesIn,
  busy,
  onBid,
}: {
  open: boolean;
  onClose: () => void;
  pot: bigint;
  maxBps: number;
  bestBps: number | null;
  others: number;
  closesIn: string;
  busy: boolean;
  onBid: (bps: number) => void;
}) {
  const t = useT();
  const { fmt } = useMoney();
  const min = Math.min(maxBps, (bestBps ?? 0) + 50);
  const [bps, setBps] = useState(Math.min(maxBps, Math.max(min, 500)));
  const value = Math.max(bps, min);
  const discount = (pot * BigInt(value)) / 10_000n;
  const toReserve = (discount * 2n) / 10n; // 20% of each discount stays in the circle's safety reserve
  const each = others > 0 ? (discount - toReserve) / BigInt(others) : 0n;
  const pct = (value / 100).toFixed(1);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("bid.title")}
      description={t("live.bidBody", { pot: fmt(pot), time: closesIn })}
      footer={
        <>
          <Button size="lg" busy={busy} disabled={min > maxBps} onClick={() => onBid(value)}>
            {t("live.bidConfirm", { pct })}
          </Button>
          <p className="text-ink-muted text-center text-xs">{value > QUICK_BID_BPS ? t("bid.bigBid") : t("live.bidQuick")}</p>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <div className="bg-paper-sunk rounded-2xl p-5 text-center">
          <p className="text-ink-muted text-sm">{t("live.youWouldGet")}</p>
          <p className="font-display tabular text-4xl">{fmt(pot - discount)}</p>
          {others > 0 && <p className="text-ink-muted mt-1 text-sm">{t("bid.shared", { each: fmt(each), count: others })}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <label htmlFor="bid" className="font-semibold">
              {t("bid.discount")}
            </label>
            <span className="tabular font-semibold">{pct}%</span>
          </div>
          <input
            id="bid"
            type="range"
            min={min}
            max={maxBps}
            step={50}
            value={value}
            onChange={(e) => setBps(Number(e.target.value))}
            className="accent-teal w-full"
          />
          <p className="text-ink-muted text-xs">{bestBps != null ? t("live.bestOffer", { pct: (bestBps / 100).toFixed(1) }) : t("live.noOffers")}</p>
        </div>
      </div>
    </Sheet>
  );
}
