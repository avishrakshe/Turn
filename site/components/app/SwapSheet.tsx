"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useMoney } from "@/lib/app/hooks";
import { memberName } from "@/lib/app/selectors";
import { type CircleRec, store, YOU } from "@/lib/app/store";
import { cn } from "@/lib/cn";
import { eligibleMembers, expectedRound, withheldIfWinningIn } from "@/lib/economics/engine";
import { useT } from "@/lib/i18n";
import { useApp } from "./AppProvider";

/**
 * Swap turns with another member (fixed-order circles). Before confirming, it shows how the
 * safety deposit held from your payout changes, because collateral follows the seat.
 */
export function SwapSheet({ circle: c, open, onClose }: { circle: CircleRec; open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const { passkey } = useApp();
  const { fmt } = useMoney();
  const e = c.engine!;
  const mine = expectedRound(e, YOU);
  const others = eligibleMembers(e).filter((m) => m.id !== YOU);
  const [pick, setPick] = useState<string | null>(null);
  const theirs = pick ? expectedRound(e, pick) : null;

  async function ask() {
    if (!pick || theirs === null) return;
    const name = memberName(c, pick);
    if (!(await passkey(t("swap.passkeySummary", { name })))) return;
    store.requestSwap(c.id, pick);
    onClose();
    toast({ title: t("swap.waiting", { name }) });
    // Demo: the other member agrees a moment later. Live, they confirm with their own Face ID.
    window.setTimeout(() => {
      store.completeSwap(c.id);
      toast({ tone: "success", title: t("swap.done", { name, round: theirs }) });
    }, 1800);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("swap.title")}
      description={t("swap.body")}
      footer={
        pick && (
          <Button size="lg" onClick={ask}>
            {t("swap.confirm", { name: memberName(c, pick) })}
          </Button>
        )
      }
    >
      {others.length === 0 || mine === null ? (
        <p className="text-ink-muted pb-4">{t("swap.none")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <ul role="radiogroup" aria-label={t("swap.title")} className="flex flex-col gap-2">
            {others.map((m) => {
              const r = expectedRound(e, m.id)!;
              const selected = pick === m.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPick(m.id)}
                    className={cn("flex min-h-14 w-full items-center gap-3 rounded-2xl border p-3 text-start", selected ? "border-marigold bg-marigold-soft" : "border-line bg-paper-raised")}
                  >
                    <Avatar name={m.name} size={32} />
                    <span className="flex-1 font-semibold">{m.name}</span>
                    <span className="text-ink-muted text-sm">{t("swap.now", { round: r })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {pick && theirs !== null && (
            <div className="bg-paper-sunk flex flex-col gap-1 rounded-2xl p-4 text-sm">
              <p className="font-semibold">{t("swap.change", { from: mine, to: theirs })}</p>
              <p>{t("swap.heldBefore", { amount: fmt(withheldIfWinningIn(e, YOU, mine)) })}</p>
              <p>{t("swap.heldAfter", { amount: fmt(withheldIfWinningIn(e, YOU, theirs)) })}</p>
              <p className="text-ink-muted mt-1">{t("swap.heldWhy")}</p>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
