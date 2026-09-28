// The film the landing page scrolls through: one circle of six, run month by month through the
// real economics engine (lib/economics), then laid out as beats (what happens when) and coin
// flights (every rupee that moves, and where). Everything on screen, the 3D scene, the telemetry
// and the captions, is a pure function of film time, so scrolling back and forth scrubs it exactly.

// Relative imports so vitest resolves them without the Next path alias.
import { advance, type Circle, type CircleEvent, commitBid, createCircle } from "../../../lib/economics/engine";
import { formatMoney } from "../../../lib/money";

export const CONTRIBUTION = 5000;
/** Rupees per coin on screen. Exact amounts live in the telemetry; coins are the picture. */
export const COIN = 2500;

export const MEMBERS = [
  { id: "priya", name: "Priya" },
  { id: "arjun", name: "Arjun" },
  { id: "fatima", name: "Fatima" },
  { id: "ravi", name: "Ravi Kumar" },
  { id: "meera", name: "Meera" },
  { id: "sanjay", name: "Sanjay" },
] as const;
export const SEATS = MEMBERS.length;

/** Who bids each month (in basis points) and why, and who misses. The engine decides the rest. */
const SCRIPT: Record<number, { bids?: Record<string, number>; reasons?: Record<string, string>; missed?: string[] }> = {
  1: { bids: { meera: 800, ravi: 500 }, reasons: { meera: "for a wedding" } },
  2: { bids: { arjun: 500 }, reasons: { arjun: "to stock the shop" } },
  3: { bids: { fatima: 300 }, reasons: { fatima: "for school fees" } },
  4: { missed: ["arjun"] },
};

// Where money sits: each member's seat (their own pocket, a source and a sink), the stack held
// for them by the circle (deposit, then safety deposit), the pot, and the circle's reserve.
export const seatNode = (i: number) => i;
export const heldNode = (i: number) => SEATS + i;
export const POT = SEATS * 2;
export const RESERVE = SEATS * 2 + 1;
export const NODES = SEATS * 2 + 2;
export const isStack = (n: number) => n >= SEATS && n <= POT;

export type FlightKind = "deposit" | "contribution" | "cover" | "release" | "withheld" | "payout" | "discount" | "credit" | "claim" | "share";

export interface Flight {
  kind: FlightKind;
  month: number;
  member: number;
  from: number;
  to: number;
  t0: number;
  t1: number;
  /** Rupees it carries. The values of every flight out of a node add up to what went in. */
  value: number;
  /** A spark of value (credit, a reserve share) rather than a coin. */
  mote: boolean;
  /** Stack positions it leaves from and lands on (0 = bottom). */
  srcSlot: number;
  dstSlot: number;
}

export type Phase = "title" | "join" | "collect" | "bids" | "reveal" | "payout" | "complete" | "outro";

export interface Beat {
  phase: Phase;
  /** 0 before the first month, MONTHS + 1 after the last. */
  month: number;
  t0: number;
  t1: number;
  /** Scroll per film second: the time-warp. Slow beats get more scroll. */
  weight: number;
  /** Shown one after another across the beat. */
  captions: string[];
}

export interface Bid {
  month: number;
  member: number;
  bps: number;
  won: boolean;
  t0: number; // rises, sealed
  tReveal: number; // flips open
  t1: number; // gone
}

/** The marigold "whose turn" marker glides to `member` between t0 and t1. */
export interface Turn {
  month: number;
  member: number;
  t0: number;
  t1: number;
}

export interface Miss {
  month: number;
  member: number;
  t0: number;
  t1: number;
}

export interface Film {
  beats: Beat[];
  flights: Flight[];
  bids: Bid[];
  turns: Turn[];
  misses: Miss[];
  /** When each seat appears. */
  joins: number[];
  duration: number;
  totalWeight: number;
  months: number;
  /** Plain-language record of the whole film, for screen readers. */
  transcript: string[];
}

const inr = (n: number | bigint) => formatMoney(Number(n), "INR");
/** The part of a missed payment the member's own discount credit paid (the engine spends it first). */
const creditFor = (e: Extract<CircleEvent, { type: "DefaultMarked" }>) => CONTRIBUTION - Number(e.fromDeposit + e.fromCollateral + e.fromReserve);
const first = (i: number) => MEMBERS[i]!.name.split(" ")[0]!;
const seatOf = (id: string) => MEMBERS.findIndex((m) => m.id === id);

/** Runs the circle through the engine: one entry per month, with the circle before and after. */
export function runCircle() {
  let c: Circle = createCircle(
    { contribution: BigInt(CONTRIBUTION), mode: "AUCTION", maxDiscountBps: 2000, entryDeposit: BigInt(CONTRIBUTION), reserveBps: 2000 },
    MEMBERS.map(({ id, name }) => ({ id, name })),
  );
  const start = c;
  const rounds: Array<{ month: number; events: CircleEvent[]; before: Circle; after: Circle }> = [];
  for (let month = 1; c.status !== "COMPLETED"; month++) {
    const before = c;
    for (const [id, bps] of Object.entries(SCRIPT[month]?.bids ?? {})) c = commitBid(c, id, bps);
    const { circle, events } = advance(c, { missed: SCRIPT[month]?.missed ?? [] });
    rounds.push({ month, events, before, after: circle });
    c = circle;
  }
  return { start, rounds };
}

/** Pacing per month: [collect, bids, reveal, payout] seconds, and their time-warp weights. */
function pace(month: number, missed: boolean, bids: boolean) {
  if (month === 1) return { d: [3, 2.6, 1.8, 4.4], w: [1.2, 1.2, 1.3, 1.6] };
  if (missed) return { d: [3.6, 1, 1, 2], w: [1.5, 0.7, 0.9, 0.9] };
  if (month === 2) return { d: [2.4, 1.6, 1.2, 2.6], w: [1, 0.9, 1, 1.1] };
  return { d: [bids ? 1.8 : 1.6, bids ? 1.4 : 0.9, 1.1, bids ? 2.4 : 1.9], w: [0.8, 0.7, 0.9, 1] };
}

export function buildFilm(): Film {
  const { rounds } = runCircle();
  const beats: Beat[] = [];
  const flights: Flight[] = [];
  const bids: Bid[] = [];
  const turns: Turn[] = [];
  const misses: Miss[] = [];
  const transcript: string[] = [];
  let t = 0;

  const beat = (phase: Phase, month: number, dur: number, weight: number, captions: string[]) => {
    const b: Beat = { phase, month, t0: t, t1: t + dur, weight, captions };
    beats.push(b);
    transcript.push(...captions);
    t += dur;
    return b;
  };

  // `count` coins leave one after another between start and end, each taking `travel` seconds.
  const fly = (kind: FlightKind, month: number, member: number, from: number, to: number, value: number, count: number, start: number, end: number, mote = false) => {
    if (count <= 0 || value <= 0) return;
    const travel = Math.min(0.85, (end - start) * (count === 1 ? 1 : 0.55));
    const base = Math.floor(value / count);
    for (let k = 0; k < count; k++) {
      const t0 = count === 1 ? start : start + ((end - start - travel) * k) / (count - 1);
      flights.push({ kind, month, member, from, to, t0, t1: t0 + travel, value: k === count - 1 ? value - base * (count - 1) : base, mote, srcSlot: 0, dstSlot: 0 });
    }
  };
  const coins = (amount: bigint | number) => Math.round(Number(amount) / COIN);

  // --- Title, then everyone joins and puts in their deposit.
  beat("title", 0, 1.8, 1, []);
  const join = beat("join", 0, 3.2, 1, [
    `Six people join with Face ID. Each puts in a ${inr(CONTRIBUTION)} deposit, held by the circle’s own contract, not by any person.`,
  ]);
  const joins = MEMBERS.map((_, i) => join.t0 + 0.15 + i * 0.34);
  joins.forEach((at, i) => fly("deposit", 0, i, seatNode(i), heldNode(i), CONTRIBUTION, coins(CONTRIBUTION), at + 0.3, at + 1.2));

  const winners: number[] = [];
  for (const { month, events } of rounds) {
    const script = SCRIPT[month] ?? {};
    const auction = events.find((e) => e.type === "AuctionClosed")!;
    const payout = events.find((e) => e.type === "PayoutMade")!;
    const defaults = events.filter((e) => e.type === "DefaultMarked");
    const releases = events.filter((e) => e.type === "CollateralReleased");
    const credits = events.filter((e) => e.type === "CreditAccrued");
    const valid = auction.revealed.filter((b) => b.valid);
    const w = seatOf(auction.winner);
    const { d, w: weight } = pace(month, defaults.length > 0, valid.length > 0);

    // 1. Auto-pay. Anyone who misses is covered from what's held for them.
    const missNames = defaults.map((e) => first(seatOf(e.member)));
    const collectCaps = [`Month ${month}. Auto-pay collects ${inr(CONTRIBUTION)} from everyone${missNames.length ? ` except ${missNames.join(" and ")}` : ""}.`];
    if (releases.length) {
      const names = releases.map((e) => first(seatOf(e.member)));
      const step = releases.every((e) => e.amount === releases[0]!.amount) ? `, ${inr(releases[0]!.amount)} at a time` : "";
      collectCaps[0] +=
        names.length === 1
          ? ` As ${names[0]} keeps paying, the safety deposit comes back${step}.`
          : names.length === 2
            ? ` As ${list(names)} keep paying, their safety deposits come back${step}.`
            : ` Everyone who has had a turn keeps paying, and their safety deposits come back bit by bit.`;
    }
    for (const e of defaults) {
      const i = seatOf(e.member);
      const src = e.fromCollateral > 0n ? `the safety deposit held back from ${first(i)}’s payout` : e.fromDeposit > 0n ? `${first(i)}’s joining deposit` : "the circle’s reserve";
      const credit = creditFor(e);
      collectCaps.push(
        `${first(i)} misses this month’s payment. ${cap(src)} covers it automatically${credit > 0 ? `, after ${inr(credit)} of discount credit` : ""}, so the pot is still full and nobody has to chase anyone.`,
      );
    }
    const collect = beat("collect", month, d[0]!, weight[0]!, collectCaps);
    const gap = (collect.t1 - collect.t0) * 0.5 / SEATS;
    for (const e of events) {
      if (e.type !== "ContributionPaid" && e.type !== "DefaultMarked") continue;
      const i = seatOf(e.member);
      const at = collect.t0 + 0.12 + i * gap;
      if (e.type === "ContributionPaid") {
        fly("contribution", month, i, seatNode(i), POT, Number(e.amount), coins(e.amount), at, at + 1.1);
      } else {
        // Credit is spent first (it sits with the member, so it leaves the seat), then what's held.
        const covered = e.fromDeposit + e.fromCollateral;
        fly("cover", month, i, heldNode(i), POT, Number(covered), coins(covered), at, at + 1.1);
        if (e.fromReserve > 0n) fly("cover", month, i, RESERVE, POT, Number(e.fromReserve), coins(e.fromReserve), at, at + 1.1);
        fly("cover", month, i, seatNode(i), POT, creditFor(e), 1, at, at + 1.1, true);
        misses.push({ month, member: i, t0: collect.t0, t1: collect.t1 });
      }
    }
    const relStart = collect.t0 + (collect.t1 - collect.t0) * 0.58;
    for (const e of releases) {
      const i = seatOf(e.member);
      fly("release", month, i, heldNode(i), seatNode(i), Number(e.amount), coins(e.amount), relStart, collect.t1 - 0.05);
    }

    // 2. Sealed bids, then the reveal.
    const bidCaps = valid.length
      ? [
          valid
            .map((b, k) => {
              const i = seatOf(b.member);
              const why = script.reasons?.[b.member];
              return k === 0 ? `${first(i)} needs money${why ? ` ${why}` : ""} and offers a discount to go first.` : `${first(i)} bids too.`;
            })
            .join(" ") + " Bids stay sealed until bidding closes, so nobody can outbid anyone by a rupee at the last second.",
        ]
      : [`Bidding is open for five days. Nobody bids this month.`];
    const bidBeat = beat("bids", month, d[1]!, weight[1]!, bidCaps);
    const revealCaps = valid.length
      ? [`The sealed bids are opened: ${valid.map((b) => `${first(seatOf(b.member))} ${b.bps / 100}%`).join(", ")}. ${first(w)} offered the most, so it’s ${first(w)}’s turn.`]
      : [`Nobody bid, so it’s ${first(w)}’s turn: next in line.`];
    const reveal = beat("reveal", month, d[2]!, weight[2]!, revealCaps);
    const payoutDur = d[3]!;
    valid.forEach((b, k) =>
      bids.push({
        month,
        member: seatOf(b.member),
        bps: b.bps,
        won: b.member === auction.winner,
        t0: bidBeat.t0 + 0.15 + k * 0.4,
        tReveal: reveal.t0 + 0.1,
        t1: reveal.t1 + payoutDur * 0.3,
      }),
    );
    turns.push({ month, member: w, t0: reveal.t0 + (reveal.t1 - reveal.t0) * 0.35, t1: reveal.t1 });

    // 3. The payout: the safety deposit stays behind, the discount is shared, the rest goes to the winner.
    const remaining = rounds.length - month; // payments the winner still owes
    let held: string;
    if (payout.collateralWithheld > 0n) held = ` ${inr(payout.collateralWithheld)} stays behind as a safety deposit and comes back as ${first(w)} keeps paying.`;
    else if (remaining > 0) held = ` The joining deposit already covers the payment ${first(w)} still owes, so nothing more is held back.`;
    else held = ` ${first(w)} is last in line, so nothing is held back.`;
    const payoutCaps = [`${first(w)} receives ${inr(payout.netPaid)} now.${held}`];
    if (payout.discount > 0n) {
      const each = credits[0]?.amount ?? 0n;
      payoutCaps.push(
        `The ${inr(payout.discount)} discount is shared: ${inr(each)} off each of the other ${words(credits.length)} members’ next payment, and ${inr(payout.toReserve)} into the circle’s reserve.`,
      );
    }
    const pay = beat("payout", month, payoutDur, weight[3]!, payoutCaps);
    const P = pay.t1 - pay.t0;
    const potCoins = coins(payout.pot);
    const heldCoins = coins(payout.collateralWithheld);
    const discountCoins = payout.discount > 0n ? Math.max(1, coins(payout.discount)) : 0;
    fly("withheld", month, w, POT, heldNode(w), Number(payout.collateralWithheld), heldCoins, pay.t0 + P * 0.14, pay.t0 + P * 0.55);
    fly("discount", month, w, POT, RESERVE, Number(payout.discount), discountCoins, pay.t0 + P * 0.16, pay.t0 + P * 0.38);
    credits.forEach((e, k) => {
      const at = pay.t0 + P * (0.42 + k * 0.035);
      fly("credit", month, seatOf(e.member), RESERVE, seatNode(seatOf(e.member)), Number(e.amount), 1, at, at + Math.min(0.8, P * 0.3), true);
    });
    fly("payout", month, w, POT, seatNode(w), Number(payout.netPaid), potCoins - heldCoins - discountCoins, pay.t0 + P * 0.45, pay.t0 + P * 0.94);
    winners.push(w);

    // 4. The last month also completes the circle: what's held goes home, the reserve is shared.
    const done = events.find((e) => e.type === "CircleCompleted");
    if (done) {
      const caps = [`The circle is complete. Everyone has had the pot once, and every safety deposit has gone back.`];
      if (done.reserveDistributed > 0n) {
        caps.push(`The ${inr(done.reserveDistributed)} left in the reserve is shared by the ${words(done.recipients.length)} members who never missed a payment: ${inr(done.sharePerMember)} each.`);
      }
      const end = beat("complete", month + 1, 3.6, 1.3, caps);
      const E = end.t1 - end.t0;
      assignSlots(flights);
      const stacks = ledger(flights, end.t0);
      for (let i = 0; i < SEATS; i++) {
        fly("claim", month + 1, i, heldNode(i), seatNode(i), stacks.value[heldNode(i)]!, stacks.count[heldNode(i)]!, end.t0 + E * 0.08, end.t0 + E * 0.45);
      }
      done.recipients.forEach((id, k) => {
        const at = end.t0 + E * (0.35 + k * 0.05);
        fly("share", month + 1, seatOf(id), RESERVE, seatNode(seatOf(id)), Number(done.sharePerMember), 1, at, at + Math.min(0.8, E * 0.25), true);
      });
    }
  }

  const months = rounds.length;
  const outro = beat("outro", months + 1, 3, 1.1, [`Six people, six turns, and a full pot every month.`]);
  // The marker comes to rest at two o'clock: the ring becomes the Turn mark.
  turns.push({ month: months + 1, member: 1, t0: outro.t0 + 0.4, t1: outro.t0 + 2.2 });

  assignSlots(flights);
  const totalWeight = beats.reduce((s, b) => s + (b.t1 - b.t0) * b.weight, 0);
  return { beats, flights, bids, turns, misses, joins, duration: t, totalWeight, months, transcript };
}

// --- ledger ------------------------------------------------------------------------------------

/**
 * Plays every launch and landing in time order to give each coin the stack slot it leaves from
 * and lands on. Coins leave from the top and land on the top.
 */
function assignSlots(flights: Flight[]) {
  type Ev = { t: number; f: Flight; land: boolean };
  const evs: Ev[] = [];
  for (const f of flights) evs.push({ t: f.t0, f, land: false }, { t: f.t1, f, land: true });
  // At the same instant, landings go before launches so a stack never dips below zero.
  evs.sort((a, b) => a.t - b.t || (a.land === b.land ? 0 : a.land ? -1 : 1));
  const count = new Array<number>(NODES).fill(0);
  for (const { f, land } of evs) {
    if (land) {
      if (!f.mote && isStack(f.to)) f.dstSlot = count[f.to]!++;
    } else if (!f.mote && isStack(f.from)) {
      f.srcSlot = --count[f.from]!;
    }
  }
}

/** Coins and rupees at every node at film time t. */
export function ledger(flights: Flight[], t: number) {
  const count = new Array<number>(NODES).fill(0);
  const value = new Array<number>(NODES).fill(0);
  for (const f of flights) {
    if (t >= f.t1) {
      value[f.to]! += f.value;
      if (!f.mote) count[f.to]!++;
    }
    if (t >= f.t0) {
      value[f.from]! -= f.value;
      if (!f.mote) count[f.from]!--;
    }
  }
  return { count, value };
}

// --- time-warp -----------------------------------------------------------------------------------

/** Scroll progress (0..1) to film time, giving each beat its weight of scroll. */
export function timeAt(film: Film, p: number): number {
  let w = Math.max(0, Math.min(1, p)) * film.totalWeight;
  for (const b of film.beats) {
    const span = (b.t1 - b.t0) * b.weight;
    if (w <= span) return b.t0 + w / b.weight;
    w -= span;
  }
  return film.duration;
}

/** Film time to scroll progress: the inverse of timeAt. */
export function progressAt(film: Film, t: number): number {
  let w = 0;
  for (const b of film.beats) {
    if (t <= b.t1) return (w + (Math.max(t, b.t0) - b.t0) * b.weight) / film.totalWeight;
    w += (b.t1 - b.t0) * b.weight;
  }
  return 1;
}

export function beatAt(film: Film, t: number): number {
  const i = film.beats.findIndex((b) => t < b.t1);
  return i < 0 ? film.beats.length - 1 : i;
}

// --- telemetry -----------------------------------------------------------------------------------

export interface Telemetry {
  beat: number;
  phase: Phase;
  month: number;
  caption: string;
  clock: string;
  countdown: string | null;
  pot: number;
  held: number;
  reserve: number;
  paid: number;
  covered: number;
  turn: number | null;
}

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const pad = (n: number) => String(n).padStart(2, "0");
// The circle starts on 1 November 2026. Clock times are Indian Standard Time.
const monthStart = (m: number) => Date.UTC(2026, 10 + m - 1, 1);
const HOUR = 3_600_000;

function clockAt(b: Beat, u: number, months: number): number {
  const m = Math.min(Math.max(b.month, 1), months);
  const day = monthStart(m);
  switch (b.phase) {
    case "title":
    case "join":
      return monthStart(1) - HOUR * 6 + u * HOUR * 3; // the evening before: 18:00 to 21:00
    case "collect":
      return day + HOUR * 9 + u * 60_000; // auto-pay at 09:00
    case "bids":
      return day + HOUR * 9 + 60_000 + u * (HOUR * (4 * 24 + 11) - 60_000); // five days, closing at 20:00 on the 5th
    case "reveal":
      return day + HOUR * (4 * 24 + 20) + u * 5_000;
    case "payout":
      return day + HOUR * (4 * 24 + 20) + 5_000 + u * 1_000; // settles in about a second
    default:
      return monthStart(months) + HOUR * (4 * 24 + 20) + 6_000;
  }
}

function formatClock(ms: number) {
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()]} ${pad(d.getUTCDate())} ${MONS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} IST`;
}

export function telemetry(film: Film, t: number): Telemetry {
  const i = beatAt(film, t);
  const b = film.beats[i]!;
  const u = Math.max(0, Math.min(1, (t - b.t0) / (b.t1 - b.t0)));
  const { value } = ledger(film.flights, t);
  let held = 0;
  for (let s = 0; s < SEATS; s++) held += value[heldNode(s)]!;

  // Paid this month: members whose contribution (or cover) has fully landed in the pot.
  let paid = 0;
  let covered = 0;
  if (b.month >= 1 && b.month <= film.months) {
    const landed = new Map<number, { kind: FlightKind; done: boolean }>();
    for (const f of film.flights) {
      if (f.month !== b.month || (f.kind !== "contribution" && f.kind !== "cover")) continue;
      const cur = landed.get(f.member);
      landed.set(f.member, { kind: f.kind, done: (cur?.done ?? true) && t >= f.t1 });
    }
    for (const v of landed.values()) if (v.done) v.kind === "cover" ? covered++ : paid++;
  }

  let countdown: string | null = null;
  const now = clockAt(b, u, film.months);
  if (b.phase === "bids") {
    const close = monthStart(b.month) + HOUR * (4 * 24 + 20);
    const left = Math.max(0, close - now);
    const days = Math.floor(left / (24 * HOUR));
    const rest = left - days * 24 * HOUR;
    countdown = `${days}D ${pad(Math.floor(rest / HOUR))}:${pad(Math.floor((rest % HOUR) / 60_000))}:${pad(Math.floor((rest % 60_000) / 1000))}`;
  }

  let turn: number | null = null;
  for (const tr of film.turns) if (t >= tr.t1 && tr.month <= film.months) turn = tr.member;

  const caps = b.captions;
  return {
    beat: i,
    phase: b.phase,
    month: b.month,
    caption: caps.length ? caps[Math.min(caps.length - 1, Math.floor(u * caps.length))]! : "",
    clock: formatClock(now),
    countdown,
    pot: value[POT]!,
    held,
    reserve: value[RESERVE]!,
    paid,
    covered,
    turn,
  };
}

// --- words ---------------------------------------------------------------------------------------

function list(names: string[]) {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const words = (n: number) => WORDS[n] ?? String(n);

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
