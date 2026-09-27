"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { type SeatStatus, TurnRing } from "@/components/ring/TurnRing";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDate, useMoney, useStore } from "@/lib/app/hooks";
import { type Health, health, memberName, nextPayment, payoutOf, yourTurn } from "@/lib/app/selectors";
import { type CircleRec, store, YOU } from "@/lib/app/store";
import { eligibleMembers, expectedRound, potFor, withheldIfWinningIn } from "@/lib/economics/engine";
import { useT } from "@/lib/i18n";
import { BidSheet } from "./BidSheet";
import { RevealSheet } from "./RevealSheet";
import { ShareInvite } from "./ShareInvite";
import { SwapSheet } from "./SwapSheet";
import { Timeline } from "./Timeline";
import { PayMethodLine } from "./Wallet";

const healthTone: Record<Health, "success" | "warning" | "danger" | "neutral" | "trust"> = {
  green: "success",
  amber: "warning",
  red: "danger",
  forming: "neutral",
  done: "trust",
};

export function CircleScreen({ id }: { id: string }) {
  const t = useT();
  const c = useStore((s) => s.circles[id]);
  if (!c) {
    return (
      <EmptyState
        title={t("circle.notFound")}
        action={
          <Link href="/app" className="text-teal-ink min-h-11 font-semibold underline">
            {t("nav.home")}
          </Link>
        }
      />
    );
  }
  return <CircleView c={c} />;
}

function CircleView({ c }: { c: CircleRec }) {
  const t = useT();
  const [bidOpen, setBidOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const e = c.engine;
  const h = health(c);

  const sub = !e
    ? t("circle.forming", { joined: c.members.length, total: c.n })
    : e.status === "COMPLETED"
      ? t("circle.complete")
      : e.status === "SETTLEMENT"
        ? t("circle.settling")
        : t("circle.roundOf", { round: e.round, total: e.totalRounds });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl">{c.name}</h1>
          <Badge tone={healthTone[h]} dot className="mt-2">
            {t(`home.health.${h}`)}
          </Badge>
        </div>
        <p className="text-ink-muted mt-1">{sub}</p>
      </div>

      {!e ? <ShareInvite circle={c} /> : <Running c={c} onBid={() => setBidOpen(true)} onSwap={() => setSwapOpen(true)} />}

      <Timeline circle={c} />
      {e && e.status !== "COMPLETED" && <DemoControls c={c} />}

      {e && e.status === "ACTIVE" && <BidSheet key={`${c.id}-${e.round}`} circle={c} open={bidOpen} onClose={() => setBidOpen(false)} />}
      {e && e.status === "ACTIVE" && <SwapSheet circle={c} open={swapOpen} onClose={() => setSwapOpen(false)} />}
      {e && <RevealSheet circle={c} />}
    </div>
  );
}

function Running({ c, onBid, onSwap }: { c: CircleRec; onBid: () => void; onSwap: () => void }) {
  const t = useT();
  const { fmt } = useMoney();
  const date = useDate();
  const e = c.engine!;
  const me = e.members.find((m) => m.id === YOU)!;
  const last = c.history.at(-1);
  const lastPayout = payoutOf(last?.events ?? []);
  const turn = yourTurn(c);
  const next = nextPayment(c);
  const active = e.status === "ACTIVE";
  const auction = e.params.mode === "AUCTION";
  const eligible = active && me.wonRound === null && !me.ejected;
  const sealed = e.bids[YOU] !== undefined;
  const myRound = expectedRound(e, YOU);
  const nextWinner = !auction && active ? eligibleMembers(e).sort((a, b) => a.joinIndex - b.joinIndex)[0] : undefined;
  const held = me.collateral + me.deposit;
  const eachBack = me.debt > 0n ? (me.collateral * e.params.contribution) / me.debt : 0n;

  // Fixed order: the marker sits on whose turn it is this month. Auctions: nobody's turn is
  // decided while bidding is open, so there's no marker. Status dots show last month's payments.
  const markerId = active && !auction ? nextWinner?.id : undefined;
  const seatIndex = useForwardStep(markerId ? c.members.findIndex((m) => m.id === markerId) : 0, c.members.length);
  const statuses: Record<string, SeatStatus> = last?.statuses ?? {};
  const ringMembers = c.members.map((m) => ({ name: m.id === YOU ? t("common.you") : m.name, status: statuses[m.id] ?? "pending" }));

  const missed = last?.events.filter((ev) => ev.type === "DefaultMarked" || ev.type === "MemberEjected") ?? [];

  return (
    <>
      <div className="mx-auto w-full max-w-80">
        <TurnRing
          members={ringMembers}
          step={seatIndex}
          marker={!!markerId}
          showStatus={!!last}
          center={
            <>
              <span className="text-ink-muted text-[0.7rem] font-semibold tracking-[0.12em] uppercase">{t("circle.potLabel")}</span>
              <span className="tabular font-display mt-1 text-2xl">{fmt(potFor(e))}</span>
              <span className="text-marigold-ink mt-1 text-xs font-semibold">
                {!active ? "" : auction ? t("circle.biddingOpen") : nextWinner ? t("circle.turnOf", { name: memberName(c, nextWinner.id) }) : ""}
              </span>
            </>
          }
        />
      </div>

      {turn === "won" && lastPayout && (
        <Card tone="turn">
          <p className="font-display text-2xl">{t("circle.yourTurnTitle")}</p>
          <p className="mt-1">
            {lastPayout.collateralWithheld > 0n
              ? t("circle.yourTurnBody", { amount: fmt(lastPayout.netPaid), held: fmt(lastPayout.collateralWithheld) })
              : t("circle.yourTurnBodyNoHold", { amount: fmt(lastPayout.netPaid) })}
          </p>
        </Card>
      )}

      {missed.length > 0 && (
        <Card tone="sunk" className="flex flex-col gap-1">
          {missed.map((ev, i) => (
            <p key={i}>
              {ev.type === "MemberEjected"
                ? t("circle.tlEjected", { name: memberName(c, ev.member) })
                : t(ev.fromReserve > 0n ? "circle.tlMissedReserve" : ev.fromCollateral > 0n ? "circle.tlMissedCollateral" : "circle.tlMissedDeposit", {
                    name: memberName(c, ev.member),
                  })}
            </p>
          ))}
          {!missed.some((ev) => ev.member === YOU) && <p className="text-success font-semibold">{t("circle.notAffected")}</p>}
        </Card>
      )}

      {/* One primary action per screen */}
      {active && auction && eligible && (
        <div className="flex flex-col gap-2">
          {sealed && (
            <p className="text-teal-ink flex items-center gap-2 font-semibold">
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
                <path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              {t("circle.bidSealed")}
            </p>
          )}
          <Button size="lg" variant={sealed ? "outline" : "primary"} onClick={onBid}>
            {t("circle.bid")}
          </Button>
        </div>
      )}
      {active && !auction && eligible && (
        <Button size="lg" variant="outline" onClick={onSwap} disabled={c.swap !== null}>
          {c.swap ? t("swap.waiting", { name: memberName(c, c.swap.with) }) : t("circle.swap")}
        </Button>
      )}
      {active && me.wonRound !== null && !turn && <p className="text-ink-muted">{t("circle.alreadyWon")}</p>}

      <dl className="bg-paper-raised border-line divide-line divide-y rounded-card border">
        {next && (
          <Row label={t("circle.nextPayment")} value={t("circle.nextPaymentValue", { amount: fmt(next.amount), date: date(next.date) })}>
            <span className={c.autopay ? "text-success text-xs font-semibold" : "text-warning text-xs font-semibold"}>
              {t(c.autopay ? "home.autopayOn" : "home.autopayOff")}
            </span>
          </Row>
        )}
        {!auction && myRound !== null && active && (
          <Row label={t("circle.yourTurnIn")} value={t("circle.yourTurnInValue", { round: myRound, amount: fmt(potFor(e) - withheldIfWinningIn(e, YOU, myRound)) })} />
        )}
        {held > 0n && (
          <Row label={t("circle.heldForSafety")} value={fmt(held)}>
            {eachBack > 0n && <span className="text-ink-muted text-xs">{t("circle.heldHint", { each: fmt(eachBack) })}</span>}
          </Row>
        )}
        {me.credit > 0n && <Row label={t("circle.credit")} value={fmt(me.credit)} />}
        {e.status === "COMPLETED" && <Row label={t("circle.complete")} value={t("circle.claimDone")} />}
      </dl>
      {next && <PayMethodLine units={next.amount} />}
    </>
  );
}

/** Turns a seat index into a monotonic ring step, so the marker only ever moves forward. */
function useForwardStep(seat: number, n: number): number {
  const ref = useRef(Math.max(0, seat));
  const from = ((ref.current % n) + n) % n;
  if (seat >= 0 && seat !== from) ref.current += (seat - from + n) % n;
  return ref.current;
}

function Row({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular flex flex-col items-end gap-0.5 text-end font-semibold">
        {value}
        {children}
      </dd>
    </div>
  );
}

function DemoControls({ c }: { c: CircleRec }) {
  const t = useT();
  const others = c.members.filter((m) => m.id !== YOU && !c.engine?.members.find((x) => x.id === m.id)?.ejected);
  const target = others[0];
  return (
    <details className="border-warning/40 bg-warning-soft/40 rounded-card border border-dashed px-5">
      <summary className="min-h-12 cursor-pointer py-3 font-semibold">{t("demo.title")}</summary>
      <div className="flex flex-col gap-3 pb-5">
        <p className="text-ink-muted text-sm">{t("demo.body")}</p>
        <Button onClick={() => store.advance(c.id)}>{t("demo.nextMonth")}</Button>
        {target && (
          <Button variant="outline" aria-pressed={c.missNext.includes(target.id)} onClick={() => store.toggleMiss(c.id, target.id)}>
            {c.missNext.includes(target.id) ? t("demo.willMiss", { name: target.name }) : t("demo.makeMiss", { name: target.name })}
          </Button>
        )}
      </div>
    </details>
  );
}
