"use client";

import { useState } from "react";
import { type SeatStatus, TurnRing } from "@/components/ring/TurnRing";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { advance, type Circle, commitBid, createCircle, maxBidBps, netOf } from "@/lib/economics/engine";
import { explain } from "@/lib/economics/explain";
import { formatMoney } from "@/lib/money";

// A no-signup, in-browser circle. It runs the same economics engine the contracts are
// specified against (lib/economics, unit-tested), so every number here is what the rules produce.

const C = 5000;
const YOU = "you";
const ARJUN = "arjun";
const MEMBERS = [
  { id: YOU, name: "You" },
  { id: ARJUN, name: "Arjun" },
  { id: "fatima", name: "Fatima" },
  { id: "ravi", name: "Ravi" },
  { id: "meera", name: "Meera" },
];
// Other members bid now and then, so the reveal has something to reveal.
const RIVAL_BIDS: Record<number, Record<string, number>> = { 2: { fatima: 300 }, 3: { ravi: 200 } };
const BID_CHOICES = [200, 400, 1000];

const money = (x: bigint | number) => formatMoney(Number(x), "INR");
const nameOf = (id: string) => MEMBERS.find((m) => m.id === id)?.name ?? id;

interface Sim {
  circle: Circle;
  step: number; // ring step (monotonic)
  statuses: Record<string, SeatStatus>;
  lines: string[];
  month: number;
  arjunMisses: boolean;
  yourBid: number | null;
}

function fresh(): Sim {
  return {
    circle: createCircle(
      { contribution: BigInt(C), mode: "AUCTION", maxDiscountBps: 2000, entryDeposit: BigInt(C), reserveBps: 2000 },
      MEMBERS,
    ),
    step: 0,
    statuses: {},
    lines: [
      "Five people, ₹5,000 each a month, for five months. Everyone has also put in a ₹5,000 deposit when joining. Press “Next month” to start.",
    ],
    month: 0,
    arjunMisses: false,
    yourBid: null,
  };
}

export function Simulation() {
  const [sim, setSim] = useState<Sim>(fresh);
  const [bidOpen, setBidOpen] = useState(false);
  const { circle } = sim;
  const done = circle.status === "COMPLETED";
  const you = circle.members.find((m) => m.id === YOU)!;
  const arjun = circle.members.find((m) => m.id === ARJUN)!;
  const yourMax = maxBidBps(circle, YOU);
  const pot = BigInt(circle.members.filter((m) => !m.ejected).length) * BigInt(C);
  const canBid = circle.status === "ACTIVE" && yourMax > 0;

  function nextMonth() {
    let c = sim.circle;
    for (const [id, bps] of Object.entries(RIVAL_BIDS[c.round] ?? {})) {
      if (bps <= maxBidBps(c, id)) c = commitBid(c, id, bps);
    }
    const { circle: next, events } = advance(c, { missed: sim.arjunMisses ? [ARJUN] : [] });

    const statuses: Record<string, SeatStatus> = {};
    for (const e of events) {
      if (e.type === "ContributionPaid" || e.type === "RepaymentPaid") statuses[e.member] = "paid";
      if (e.type === "DefaultMarked" || e.type === "MemberEjected") statuses[e.member] = "late";
    }
    const payout = events.find((e) => e.type === "PayoutMade");
    let step = sim.step;
    if (payout) {
      const seat = MEMBERS.findIndex((m) => m.id === payout.winner);
      const from = step % MEMBERS.length;
      step += (seat - from + MEMBERS.length) % MEMBERS.length || MEMBERS.length;
    }
    const lines = explain(events, { name: nameOf, money, youId: YOU });
    setSim({ circle: next, step, statuses, lines, month: sim.month + 1, arjunMisses: false, yourBid: null });
    setBidOpen(false);
  }

  function placeBid(bps: number) {
    setSim((s) => ({ ...s, circle: commitBid(s.circle, YOU, bps), yourBid: bps }));
    setBidOpen(false);
  }

  const winnerThisMonth = circle.members.find((m) => m.wonRound === circle.round - 1);
  const nextLine = done
    ? null
    : circle.status === "SETTLEMENT"
      ? "Next: the members who already had their turn pay back what Arjun put in, so Arjun can be refunded."
      : `Next month: everyone pays ${money(C)} automatically${sim.arjunMisses ? ", except Arjun" : ""}. Then the sealed bids are opened and ${money(pot)} goes to one person.`;

  return (
    <div className="bg-paper-raised border-line shadow-soft rounded-[2rem] border p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="trust" dot>Simulation</Badge>
        <span className="text-ink-muted text-sm">Runs in your browser. No sign-up, no real money.</span>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-12">
        <div>
          <TurnRing
            members={MEMBERS.map((m) => ({ name: m.name, status: sim.statuses[m.id] ?? "pending" }))}
            step={sim.step}
            potFlow
            showStatus={sim.month > 0 && circle.status === "ACTIVE"}
            label={
              sim.month === 0
                ? "A circle of five, before the first month."
                : `After month ${sim.month}. ${winnerThisMonth ? `${winnerThisMonth.name} received the pot.` : ""}`
            }
            center={
              <>
                <span className="text-ink-muted text-[0.7rem] font-semibold tracking-[0.14em] uppercase">
                  {done ? "Complete" : circle.status === "SETTLEMENT" ? "Settling up" : `Month ${circle.round} of ${circle.totalRounds}`}
                </span>
                <Amount value={Number(pot)} currency="INR" size="lg" className="mt-1" />
                <span className="text-ink-muted mt-0.5 text-xs">pot each month</span>
              </>
            }
            className="mx-auto max-w-[380px]"
          />

          <div className="mt-6 flex flex-col gap-3">
            <Button size="lg" onClick={nextMonth} disabled={done}>
              Next month
            </Button>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => setBidOpen((o) => !o)} disabled={!canBid} aria-expanded={bidOpen} aria-controls="sim-bid">
                {sim.yourBid ? "Change bid" : "Place a bid"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setSim((s) => ({ ...s, arjunMisses: !s.arjunMisses }))}
                disabled={done || arjun.ejected}
                aria-pressed={sim.arjunMisses}
                className={cn(sim.arjunMisses && "border-warning bg-warning-soft text-warning")}
              >
                Make Arjun miss a payment
              </Button>
            </div>

            {bidOpen && canBid && (
              <fieldset id="sim-bid" className="bg-paper-sunk rounded-2xl p-4">
                <legend className="sr-only">Choose a discount</legend>
                <p className="text-sm font-semibold">Want the pot this month? Offer a discount.</p>
                <p className="text-ink-muted mt-1 text-sm">
                  The biggest discount wins. It&rsquo;s shared with everyone else. Nobody sees your bid until bidding closes.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {BID_CHOICES.filter((b) => b <= yourMax).map((bps) => (
                    <Button key={bps} variant={sim.yourBid === bps ? "secondary" : "outline"} onClick={() => placeBid(bps)}>
                      {money((pot * BigInt(bps)) / 10000n)} off
                    </Button>
                  ))}
                </div>
              </fieldset>
            )}
            {sim.yourBid && !bidOpen && (
              <p className="text-teal-ink flex items-center gap-2 text-sm font-semibold">
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                  <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
                  <path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                Your bid is sealed. It stays hidden until bidding closes.
              </p>
            )}
            {you.wonRound !== null && !done && <p className="text-ink-muted text-sm">You&rsquo;ve had your turn, so you can&rsquo;t bid again.</p>}
            {nextLine && <p className="text-ink-muted text-sm">{nextLine}</p>}
            {done && (
              <Button variant="ghost" onClick={() => { setSim(fresh()); setBidOpen(false); }}>
                Start over
              </Button>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <h3 className="font-display text-2xl">{sim.month === 0 ? "Before we start" : "What just happened"}</h3>
            <div aria-live="polite" className="mt-3 space-y-3">
              {sim.lines.map((l, i) => (
                <p key={`${sim.month}-${i}`} className={cn("leading-relaxed", i === 0 ? "text-ink" : "text-ink-muted")}>
                  {l}
                </p>
              ))}
            </div>
          </div>

          <div className="border-line overflow-x-auto rounded-2xl border">
            <table className="w-full text-sm">
              <caption className="sr-only">Money in and out for each member</caption>
              <thead>
                <tr className="text-ink-muted border-line border-b text-start text-xs">
                  <th scope="col" className="px-3 py-3 text-start font-semibold sm:px-4">Member</th>
                  <th scope="col" className="px-2 py-3 text-end font-semibold sm:px-3">Put in</th>
                  <th scope="col" className="px-2 py-3 text-end font-semibold sm:px-3">Received</th>
                  <th scope="col" className="px-3 py-3 text-end font-semibold sm:px-4">{done ? "Result" : "Held for safety"}</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {circle.members.map((m) => {
                  const held = m.deposit + m.collateral;
                  const net = netOf(m);
                  return (
                    <tr key={m.id} className="border-line border-b last:border-0">
                      <th scope="row" className="px-3 py-3 text-start font-semibold sm:px-4">
                        <span className="flex flex-wrap items-center gap-2">
                          {m.name}
                          {m.wonRound !== null && <Badge tone="turn">Month {m.wonRound}</Badge>}
                          {m.ejected && <Badge tone="warning">Left</Badge>}
                        </span>
                      </th>
                      <td className="px-2 py-3 text-end sm:px-3">{money(m.paidIn)}</td>
                      <td className="px-2 py-3 text-end sm:px-3">{money(m.paidOut)}</td>
                      <td className={cn("px-3 py-3 text-end sm:px-4", done && (net >= 0n ? "text-success" : "text-warning"))}>
                        {done ? `${net >= 0n ? "+" : "−"}${money(net >= 0n ? net : -net)}` : money(held)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {done && (
            <p className="text-ink-muted text-sm">
              Anyone who bid gave up their discount in exchange for getting the pot early. Everyone who
              never missed a payment ends up with at least what they put in, apart from any discount they chose to offer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
