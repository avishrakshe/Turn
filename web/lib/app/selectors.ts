import { type CircleEvent, expectedRound, type Member } from "@/lib/economics/engine";
import type { CreditRecord } from "@/lib/economics/trust";
import { type CircleRec, type State, YOU } from "./store";

export type Health = "green" | "amber" | "red" | "forming" | "done";

/** The calendar date of a round: the first one is the day the circle started. */
export function roundDate(c: CircleRec, round: number): Date {
  const d = new Date(c.startedAt ?? c.createdAt);
  if (c.frequency === "weekly") d.setDate(d.getDate() + 7 * (round - 1));
  else d.setMonth(d.getMonth() + (round - 1));
  return d;
}

export function you(c: CircleRec): Member | undefined {
  return c.engine?.members.find((m) => m.id === YOU);
}

export const memberName = (c: CircleRec, id: string) => (id === YOU ? "You" : (c.members.find((m) => m.id === id)?.name ?? id));

/** The next amount auto-pay will take, after credit, and when. Null if nothing is due. */
export function nextPayment(c: CircleRec): { amount: bigint; date: Date; final: boolean } | null {
  const e = c.engine;
  const me = you(c);
  if (!e || !me || me.ejected || e.status === "COMPLETED") return null;
  const due = e.status === "SETTLEMENT" ? (me.repaymentOwed > e.params.contribution ? e.params.contribution : me.repaymentOwed) : e.params.contribution;
  if (due === 0n) return null;
  const credit = me.credit > due ? due : me.credit;
  return { amount: due - credit, date: roundDate(c, e.round), final: e.round >= e.totalRounds && e.status === "ACTIVE" };
}

export function health(c: CircleRec): Health {
  if (!c.engine) return "forming";
  if (c.engine.status === "COMPLETED") return "done";
  const events = c.history.flatMap((h) => h.events);
  if (events.some((e) => e.type === "MemberEjected" || (e.type === "DefaultMarked" && e.fromReserve > 0n))) return "red";
  const last = c.history.at(-1);
  if (last?.events.some((e) => e.type === "DefaultMarked")) return "amber";
  return "green";
}

/** "won": you received the pot in the latest round. "soon": fixed-order and it's your round next. */
export function yourTurn(c: CircleRec): "won" | "soon" | null {
  const e = c.engine;
  if (!e) return null;
  const last = c.history.at(-1);
  if (last?.events.some((ev) => ev.type === "PayoutMade" && ev.winner === YOU)) return "won";
  if (e.status === "ACTIVE" && expectedRound(e, YOU) === e.round) return "soon";
  return null;
}

export function payoutOf(events: CircleEvent[]) {
  return events.find((e): e is Extract<CircleEvent, { type: "PayoutMade" }> => e.type === "PayoutMade");
}

export type TimelineItem =
  | { kind: "payout"; round: number; winner: string; amount: bigint; discountBps: number; at: number }
  | { kind: "missed"; round: number; member: string; via: "deposit" | "collateral" | "reserve"; at: number }
  | { kind: "ejected"; round: number; member: string; at: number }
  | { kind: "settle"; round: number; at: number }
  | { kind: "complete"; share: bigint; at: number };

export function timeline(c: CircleRec): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const h of c.history) {
    for (const e of h.events) {
      if (e.type === "PayoutMade") {
        const closed = h.events.find((x) => x.type === "AuctionClosed");
        items.push({ kind: "payout", round: e.round, winner: e.winner, amount: e.pot - e.discount, discountBps: closed?.type === "AuctionClosed" ? closed.discountBps : 0, at: h.at });
      } else if (e.type === "DefaultMarked") {
        const via = e.fromReserve > 0n ? "reserve" : e.fromCollateral > 0n ? "collateral" : "deposit";
        items.push({ kind: "missed", round: e.round, member: e.member, via, at: h.at });
      } else if (e.type === "MemberEjected") {
        items.push({ kind: "ejected", round: e.round, member: e.member, at: h.at });
      } else if (e.type === "RepaymentPaid" && !items.some((i) => i.kind === "settle" && i.round === h.round)) {
        items.push({ kind: "settle", round: h.round, at: h.at });
      } else if (e.type === "CircleCompleted") {
        items.push({ kind: "complete", share: e.sharePerMember, at: h.at });
      }
    }
  }
  return items.reverse(); // newest first
}

/** Your Turn Score record, built from every circle in this browser (demo). */
export function creditRecord(s: State): CreditRecord {
  const r: CreditRecord = { circlesJoined: 0, circlesCompleted: 0, paymentsOnTime: 0, paymentsLate: 0, defaults: 0, totalContributed: 0n };
  for (const c of Object.values(s.circles)) {
    r.circlesJoined += 1;
    for (const h of c.history) {
      for (const e of h.events) {
        if (e.type === "ContributionPaid" && e.member === YOU) {
          r.paymentsOnTime += 1;
          r.totalContributed += e.amount;
        }
        if (e.type === "DefaultMarked" && e.member === YOU) r.defaults += 1;
      }
    }
    if (c.engine?.status === "COMPLETED" && !you(c)?.ejected) r.circlesCompleted += 1;
  }
  return r;
}
