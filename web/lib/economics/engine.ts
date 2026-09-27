// TypeScript port of the Circle economics in docs/plan.md §3.3–3.4: rounds, sealed-bid
// auction, discount credit, withheld collateral with pro-rata release, trust waivers backed by
// the protection reserve, defaults, ejection and settlement.
//
// Pure functions over plain data. All amounts are integer token units (bigint) with floor
// division, so contracts/src/Circle.sol can reproduce every number exactly. Rounding always
// favours the circle: collateral after a release is rounded UP, so exposure never grows
// from rounding dust.
//
// Not modelled yet: deposit rebates for trusted members (Y in invariant I1), posted external
// collateral, timing (grace periods, bid windows). The simulation doesn't need them.

export const BPS = 10_000n;

export type Mode = "FIXED_ORDER" | "AUCTION";
export type Status = "ACTIVE" | "SETTLEMENT" | "COMPLETED";

export interface Params {
  contribution: bigint; // C
  mode: Mode;
  maxDiscountBps: number; // ≤ 5000
  entryDeposit: bigint; // ≥ C (default C)
  reserveBps: number; // share of each discount kept in the reserve (default 2000)
}

export interface MemberInit {
  id: string;
  name: string;
  trustBps?: number;
  score?: number;
}

export interface Member {
  id: string;
  name: string;
  joinIndex: number;
  trustBps: number;
  score: number;
  ejected: boolean;
  wonRound: number | null;
  deposit: bigint; // entry deposit still held on its own (before winning)
  debt: bigint; // D: remaining contributions + repayments owed (winners)
  collateral: bigint; // K: collateral held against D (winners)
  credit: bigint; // discount credit, spent on the next contribution first
  repaymentOwed: bigint; // part of D owed to the settlement slots after an ejection
  claimable: bigint;
  misses: number; // misses before winning (the first is covered by the deposit, the second ejects)
  defaults: number;
  discountPaid: bigint;
  ejectionRefund: bigint; // paid to an ejected member at completion
  paidIn: bigint; // everything this member sent to the circle
  paidOut: bigint; // everything the circle sent to this member
}

export interface Circle {
  params: Params;
  members: Member[];
  round: number; // next round to run, 1-based
  totalRounds: number; // N minus ejections
  settlementSlots: number; // settlement slots still to run
  reserve: bigint; // R
  settlementPool: bigint; // repayments collected, owed to ejected members + penalty
  pendingPenalty: bigint;
  balance: bigint; // the circle contract's token balance
  status: Status;
  bids: Record<string, number>; // sealed bids for the current round, revealed at close
}

export type CircleEvent =
  | { type: "ContributionPaid"; member: string; round: number; amount: bigint; creditUsed: bigint }
  | { type: "DefaultMarked"; member: string; round: number; fromDeposit: bigint; fromCollateral: bigint; fromReserve: bigint }
  | { type: "MemberEjected"; member: string; round: number; k: number; refund: bigint; penalty: bigint }
  | { type: "CollateralReleased"; member: string; amount: bigint }
  | { type: "AuctionClosed"; round: number; winner: string; discountBps: number; noBids: boolean; revealed: Array<{ member: string; bps: number; valid: boolean }> }
  | { type: "PayoutMade"; winner: string; round: number; pot: bigint; discount: bigint; toReserve: bigint; collateralWithheld: bigint; trustWaiver: bigint; netPaid: bigint }
  | { type: "CreditAccrued"; member: string; round: number; amount: bigint }
  | { type: "RepaymentPaid"; member: string; amount: bigint }
  | { type: "CircleCompleted"; reserveDistributed: bigint; sharePerMember: bigint; recipients: string[] }
  | { type: "Claimed"; member: string; amount: bigint };

export class CircleError extends Error {}

const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new CircleError(msg);
}

// ---------------------------------------------------------------- setup

export function createCircle(params: Params, inits: MemberInit[]): Circle {
  const n = inits.length;
  assert(n >= 3 && n <= 20, "a circle has 3 to 20 members");
  assert(params.contribution > 0n, "contribution must be positive");
  assert(params.entryDeposit >= params.contribution, "entry deposit must cover one contribution");
  assert(params.maxDiscountBps >= 0 && params.maxDiscountBps <= 5000, "max discount is 0–50%");
  assert(params.reserveBps >= 0 && params.reserveBps <= 10_000, "reserveBps out of range");
  assert(new Set(inits.map((m) => m.id)).size === n, "member ids must be unique");

  const members: Member[] = inits.map((m, i) => ({
    id: m.id,
    name: m.name,
    joinIndex: i,
    trustBps: Math.max(0, Math.min(8000, m.trustBps ?? 0)),
    score: m.score ?? 0,
    ejected: false,
    wonRound: null,
    deposit: params.entryDeposit,
    debt: 0n,
    collateral: 0n,
    credit: 0n,
    repaymentOwed: 0n,
    claimable: 0n,
    misses: 0,
    defaults: 0,
    discountPaid: 0n,
    ejectionRefund: 0n,
    paidIn: params.entryDeposit,
    paidOut: 0n,
  }));

  return {
    params,
    members,
    round: 1,
    totalRounds: n,
    settlementSlots: 0,
    reserve: 0n,
    settlementPool: 0n,
    pendingPenalty: 0n,
    balance: params.entryDeposit * BigInt(n),
    status: "ACTIVE",
    bids: {},
  };
}

// ---------------------------------------------------------------- views

export const activeMembers = (c: Circle) => c.members.filter((m) => !m.ejected);
export const eligibleMembers = (c: Circle) => c.members.filter((m) => !m.ejected && m.wonRound === null);

/** activeMembers(round)·C — invariant I3. */
export const potFor = (c: Circle) => BigInt(activeMembers(c).length) * c.params.contribution;

/** ΣX: debt not covered by collateral, across winners. Must stay ≤ reserve (I1). */
export function exposure(c: Circle): bigint {
  let x = 0n;
  for (const m of c.members) if (!m.ejected && m.wonRound !== null) x += max(0n, m.debt - m.collateral);
  return x;
}

function remainingAfterWin(c: Circle): bigint {
  return BigInt(c.totalRounds - c.round) * c.params.contribution;
}

/**
 * Highest discount this member may bid this round: the payout must still cover the collateral
 * withheld from it (estimated with no trust waiver, so it's safe). Returns 0 if not eligible.
 */
export function maxBidBps(c: Circle, id: string): number {
  const m = c.members.find((x) => x.id === id);
  if (!m || m.ejected || m.wonRound !== null || c.status !== "ACTIVE" || c.params.mode !== "AUCTION") return 0;
  const pot = potFor(c);
  const withheld = max(0n, remainingAfterWin(c) + m.repaymentOwed - m.deposit);
  if (withheld >= pot) return 0;
  const affordable = Number(((pot - withheld) * BPS) / pot);
  return Math.min(c.params.maxDiscountBps, affordable);
}

// ---------------------------------------------------------------- actions

/** Seal a bid for the current round. It stays hidden until the auction closes. */
export function commitBid(c: Circle, id: string, bps: number): Circle {
  assert(c.params.mode === "AUCTION", "this circle takes turns in order");
  assert(Number.isInteger(bps) && bps > 0, "bid must be a positive whole number of bps");
  assert(bps <= maxBidBps(c, id), "bid is above the allowed maximum");
  return { ...c, bids: { ...c.bids, [id]: bps } };
}

export interface AdvanceOptions {
  /** Members who don't pay this period. */
  missed?: readonly string[];
}

/**
 * Runs the next period: a normal round, a settlement slot after an ejection, and completion
 * once everything is settled. Returns the new circle and the events it emitted.
 */
export function advance(prev: Circle, opts: AdvanceOptions = {}): { circle: Circle; events: CircleEvent[] } {
  assert(prev.status !== "COMPLETED", "circle is already complete");
  const c = structuredClone(prev);
  const events: CircleEvent[] = [];
  const missed = new Set(opts.missed ?? []);

  if (c.status === "ACTIVE") {
    ejectRepeatMissers(c, missed, events);
    if (c.round <= c.totalRounds) runRound(c, missed, events);
    else c.status = "SETTLEMENT"; // the ejection removed this round; it becomes a settlement slot
  }
  if (c.status === "SETTLEMENT" && c.settlementSlots > 0) runSettlementSlot(c, missed, events);
  if (c.status === "ACTIVE" && c.round > c.totalRounds) c.status = c.settlementSlots > 0 ? "SETTLEMENT" : "COMPLETED";
  if (c.status === "SETTLEMENT" && c.settlementSlots === 0) c.status = "COMPLETED";
  if (c.status === "COMPLETED") complete(c, events);

  checkInvariants(c);
  return { circle: c, events };
}

// ---------------------------------------------------------------- internals

/** A non-winner's second miss ejects them (plan §3.4). Runs before collection. */
function ejectRepeatMissers(c: Circle, missed: Set<string>, events: CircleEvent[]) {
  const C = c.params.contribution;
  for (const e of c.members) {
    if (e.ejected || e.wonRound !== null || !missed.has(e.id) || e.misses < 1) continue;
    if (e.credit >= C) continue; // their credit pays this round; not a miss
    const k = c.round - 1; // rounds they funded, including the one their deposit covered
    const funded = BigInt(k) * C;
    const refund = (funded * 9n) / 10n;
    const penalty = funded - refund;
    e.ejected = true;
    e.defaults += 1;
    e.ejectionRefund = refund;
    c.pendingPenalty += penalty;
    // Every earlier winner owes C back, collected in a settlement slot. The circle also loses one
    // round, so each of them makes one fewer contribution: their total debt is unchanged.
    for (const w of c.members) if (!w.ejected && w.wonRound !== null) w.repaymentOwed += C;
    c.totalRounds -= 1;
    c.settlementSlots += 1;
    delete c.bids[e.id];
    missed.delete(e.id);
    events.push({ type: "MemberEjected", member: e.id, round: c.round, k, refund, penalty });
  }
}

/** Winner pays `amount` toward their debt; collateral shrinks pro rata and the excess is released. */
function reduceDebt(c: Circle, m: Member, amount: bigint, events: CircleEvent[]) {
  if (m.debt === 0n) return;
  const newDebt = m.debt - amount;
  const newK = newDebt === 0n ? 0n : ceilDiv(m.collateral * newDebt, m.debt);
  const released = m.collateral - newK;
  m.debt = newDebt;
  m.collateral = newK;
  if (released > 0n) {
    m.paidOut += released;
    c.balance -= released;
    events.push({ type: "CollateralReleased", member: m.id, amount: released });
  }
}

/** Collect `amount` from a member: credit first, then cash. */
function pay(c: Circle, m: Member, amount: bigint, events: CircleEvent[]): void {
  const creditUsed = min(m.credit, amount);
  const cash = amount - creditUsed;
  m.credit -= creditUsed;
  m.paidIn += cash;
  c.balance += cash;
  events.push({ type: "ContributionPaid", member: m.id, round: c.round, amount, creditUsed });
}

/**
 * Cover a missed `amount`: credit first, then the entry deposit (before winning) or the
 * withheld collateral (after winning), then the reserve. Under I1 the reserve can always pay.
 */
function coverMiss(c: Circle, m: Member, amount: bigint, events: CircleEvent[]) {
  const creditUsed = min(m.credit, amount);
  m.credit -= creditUsed;
  const shortfall = amount - creditUsed;
  let fromDeposit = 0n;
  let fromCollateral = 0n;
  let fromReserve = 0n;
  if (m.wonRound === null) {
    fromDeposit = min(m.deposit, shortfall);
    m.deposit -= fromDeposit;
    fromReserve = shortfall - fromDeposit;
    if (shortfall > 0n) m.misses += 1;
  } else {
    fromCollateral = min(m.collateral, shortfall);
    fromReserve = shortfall - fromCollateral;
    m.collateral -= fromCollateral;
  }
  assert(fromReserve <= c.reserve, "reserve cannot cover the default (I1 violated)");
  c.reserve -= fromReserve;
  if (shortfall > 0n) {
    m.defaults += 1;
    events.push({ type: "DefaultMarked", member: m.id, round: c.round, fromDeposit, fromCollateral, fromReserve });
  } else {
    events.push({ type: "ContributionPaid", member: m.id, round: c.round, amount, creditUsed });
  }
  if (m.wonRound !== null) m.debt -= amount;
}

function runRound(c: Circle, missed: Set<string>, events: CircleEvent[]) {
  const C = c.params.contribution;
  const r = c.round;

  // 1. Collect (auto-pay), covering anyone who missed.
  let collected = 0n;
  for (const m of activeMembers(c)) {
    if (missed.has(m.id)) {
      coverMiss(c, m, C, events);
    } else {
      pay(c, m, C, events);
      if (m.wonRound !== null) reduceDebt(c, m, C, events);
    }
    collected += C;
  }
  const pot = potFor(c);
  assert(collected === pot, "I3: pot must equal activeMembers·C");

  // 2. Close the auction: reveal sealed bids, highest valid discount wins.
  const eligible = eligibleMembers(c);
  assert(eligible.length > 0, "no eligible member for this round");
  const byTieBreak = (a: Member, b: Member) => b.score - a.score || a.joinIndex - b.joinIndex;
  const revealed = Object.entries(c.bids)
    .map(([id, bps]) => ({ member: id, bps, valid: bps <= maxBidBps(c, id) }))
    .sort((a, b) => b.bps - a.bps);
  let winner: Member;
  let bps = 0;
  const best = revealed.filter((b) => b.valid);
  if (c.params.mode === "AUCTION" && best.length > 0) {
    const top = best[0]!.bps;
    const tied = eligible.filter((m) => best.some((b) => b.member === m.id && b.bps === top)).sort(byTieBreak);
    winner = tied[0]!;
    bps = top;
  } else if (c.params.mode === "AUCTION") {
    winner = [...eligible].sort(byTieBreak)[0]!;
  } else {
    winner = [...eligible].sort((a, b) => a.joinIndex - b.joinIndex)[0]!;
  }
  c.bids = {};
  events.push({ type: "AuctionClosed", round: r, winner: winner.id, discountBps: bps, noBids: bps === 0, revealed });

  // 3. Split the discount: a slice to the reserve, the rest as credit to everyone else.
  const discount = (pot * BigInt(bps)) / BPS;
  let toReserve = (discount * BigInt(c.params.reserveBps)) / BPS;
  const others = activeMembers(c).filter((m) => m.id !== winner.id);
  const pool = discount - toReserve;
  const each = pool / BigInt(others.length);
  toReserve += pool - each * BigInt(others.length); // rounding dust stays in the reserve
  c.reserve += toReserve;
  if (each > 0n) {
    for (const m of others) {
      m.credit += each;
      events.push({ type: "CreditAccrued", member: m.id, round: r, amount: each });
    }
  }
  winner.discountPaid += discount;

  // 4. Pay out, withholding collateral for what the winner still owes, minus any trust waiver
  //    the reserve can back.
  const fullReq = remainingAfterWin(c) + winner.repaymentOwed;
  const desired = (fullReq * BigInt(winner.trustBps)) / BPS;
  const available = max(0n, c.reserve - exposure(c));
  const waiver = min(desired, available);
  const target = fullReq - waiver;
  const fromDeposit = min(winner.deposit, target);
  const withheld = target - fromDeposit;
  winner.claimable += winner.deposit - fromDeposit; // deposit beyond what's needed comes back at the end
  winner.deposit = 0n;
  winner.collateral = target;
  winner.debt = fullReq;
  winner.wonRound = r;
  const netPaid = pot - discount - withheld;
  assert(netPaid >= 0n, "payout cannot cover the withheld collateral");
  winner.paidOut += netPaid;
  c.balance -= netPaid;
  events.push({ type: "PayoutMade", winner: winner.id, round: r, pot, discount, toReserve, collateralWithheld: withheld, trustWaiver: waiver, netPaid });

  c.round += 1;
}

/** One settlement slot: every winner who owes a repayment pays up to C of it. */
function runSettlementSlot(c: Circle, missed: Set<string>, events: CircleEvent[]) {
  const C = c.params.contribution;
  for (const m of activeMembers(c)) {
    if (m.repaymentOwed === 0n) continue;
    const amount = min(C, m.repaymentOwed);
    if (missed.has(m.id)) {
      coverMiss(c, m, amount, events);
    } else {
      pay(c, m, amount, events);
      reduceDebt(c, m, amount, events);
      events.push({ type: "RepaymentPaid", member: m.id, amount });
    }
    m.repaymentOwed -= amount;
    c.settlementPool += amount;
  }
  c.settlementSlots -= 1;
  c.round += 1;
}

function complete(c: Circle, events: CircleEvent[]) {
  // Repayments go to the ejected members (90%) and the reserve (10% penalty).
  let refunds = 0n;
  for (const m of c.members) if (m.ejected) refunds += m.ejectionRefund;
  assert(c.settlementPool === refunds + c.pendingPenalty, "settlement pool must equal refunds + penalties");
  c.reserve += c.pendingPenalty;
  c.settlementPool = 0n;
  c.pendingPenalty = 0n;

  // Leftover reserve is shared by members who never missed. Ejected members are excluded.
  // If everyone missed at least once, it's shared by all remaining members rather than left
  // stuck in the contract (not specified in plan.md; proposed rule for Circle.sol).
  const clean = c.members.filter((m) => !m.ejected && m.defaults === 0);
  const recipients = clean.length > 0 ? clean : activeMembers(c);
  const share = recipients.length > 0 ? c.reserve / BigInt(recipients.length) : 0n;
  const distributed = share * BigInt(recipients.length);
  c.reserve -= distributed; // dust stays
  events.push({ type: "CircleCompleted", reserveDistributed: distributed, sharePerMember: share, recipients: recipients.map((m) => m.id) });

  for (const m of c.members) {
    assert(m.ejected || m.debt === 0n, `member ${m.id} still owes at completion`);
    const amount =
      m.claimable + m.credit + m.deposit + m.collateral + (m.ejected ? m.ejectionRefund : 0n) + (recipients.includes(m) ? share : 0n);
    m.claimable = 0n;
    m.credit = 0n;
    m.deposit = 0n;
    m.collateral = 0n;
    m.ejectionRefund = 0n;
    if (amount > 0n) {
      m.paidOut += amount;
      c.balance -= amount;
      events.push({ type: "Claimed", member: m.id, amount });
    }
  }
}

// ---------------------------------------------------------------- invariants

/** Throws if any invariant fails. Called after every advance. */
export function checkInvariants(c: Circle) {
  let held = c.reserve + c.settlementPool;
  // Ejection refunds are paid from the settlement pool, so they are not counted separately.
  for (const m of c.members) held += m.collateral + m.deposit + m.credit + m.claimable;
  assert(c.balance === held, `I0: balance ${c.balance} ≠ holdings ${held}`);
  assert(exposure(c) <= c.reserve, `I1: exposure ${exposure(c)} > reserve ${c.reserve}`);
  for (const m of c.members) {
    assert(m.collateral >= 0n && m.debt >= 0n && m.credit >= 0n && m.deposit >= 0n, `negative balance for ${m.id}`);
  }
}

/** Net result for a member: everything received minus everything paid in. */
export const netOf = (m: Member) => m.paidOut - m.paidIn;
