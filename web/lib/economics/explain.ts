import type { CircleEvent } from "./engine";

// Turns one period's events into short, plain sentences for the simulation. No jargon: no
// "collateral", "default" or "reserve" without saying what it means in the same breath.

export interface ExplainContext {
  name: (id: string) => string;
  money: (amount: bigint) => string;
  youId?: string;
}

export function explain(events: CircleEvent[], ctx: ExplainContext): string[] {
  const { name, money } = ctx;
  const who = (id: string) => (id === ctx.youId ? "You" : name(id));
  const out: string[] = [];

  const repayments = events.filter((e) => e.type === "RepaymentPaid");
  if (repayments.length > 0) {
    const names = repayments.map((e) => (e.member === ctx.youId ? "you" : name(e.member))).join(", ");
    out.push(
      `Settling up: everyone who took the pot before a member left pays back ${money(repayments[0]!.amount)} (${names}). That money refunds the member who left.`,
    );
  }

  for (const e of events) {
    switch (e.type) {
      case "MemberEjected":
        out.push(
          `${who(e.member)} missed a second time before their turn, so they're out of the circle. It carries on with one fewer person, and the pot is smaller by one share. ` +
            `At the end ${who(e.member) === "You" ? "you get" : "they get"} back ${money(e.refund)} (90% of what they put in). The other ${money(e.penalty)} goes to the members who never missed.`,
        );
        break;
      case "DefaultMarked": {
        const parts: string[] = [];
        if (e.fromDeposit > 0n) parts.push(`the deposit ${who(e.member)} paid when joining covered ${money(e.fromDeposit)}`);
        if (e.fromCollateral > 0n) parts.push(`the safety deposit held back from ${who(e.member)}'s payout covered ${money(e.fromCollateral)}`);
        if (e.fromReserve > 0n) parts.push(`the circle's reserve covered ${money(e.fromReserve)}`);
        let s = `${who(e.member)} missed this month's payment. ${capitalise(parts.join(", and "))}, so the pot is still full. Nobody else is affected.`;
        if (e.fromDeposit > 0n) s += ` If ${who(e.member)} misses again before their turn, they'll be removed from the circle.`;
        out.push(s);
        break;
      }
      case "AuctionClosed": {
        const bids = e.revealed.filter((b) => b.valid);
        if (bids.length === 0) {
          out.push(`Nobody bid this month, so it's ${who(e.winner)}'s turn: next in line.`);
        } else {
          const list = bids.map((b) => `${who(b.member)} ${b.bps / 100}%`).join(", ");
          out.push(`The sealed bids were opened (${list}). ${who(e.winner)} offered the biggest discount, so it's ${e.winner === ctx.youId ? "your" : `${who(e.winner)}'s`} turn.`);
        }
        break;
      }
      case "PayoutMade": {
        const w = e.winner === ctx.youId ? "You receive" : `${who(e.winner)} receives`;
        let s = `${w} ${money(e.netPaid)} now from the ${money(e.pot)} pot.`;
        if (e.collateralWithheld > 0n) s += ` ${money(e.collateralWithheld)} is kept as a safety deposit and paid back bit by bit with each payment ${e.winner === ctx.youId ? "you make" : "they make"}.`;
        if (e.discount > 0n) {
          const shared = e.discount - e.toReserve;
          s += ` The ${money(e.discount)} discount is shared: ${money(shared)} as money off the others' next payments, and ${money(e.toReserve)} kept in the circle's reserve for emergencies.`;
        }
        out.push(s);
        break;
      }
      case "CircleCompleted":
        out.push(
          e.reserveDistributed > 0n
            ? `The circle is complete. Everyone had their turn, and the leftover reserve (${money(e.reserveDistributed)}) is shared, ${money(e.sharePerMember)} each.`
            : `The circle is complete. Everyone had their turn and got back everything held for safety.`,
        );
        break;
      default:
        break;
    }
  }
  return out;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
