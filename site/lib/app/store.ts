import type { SeatStatus } from "@/components/ring/TurnRing";
import {
  advance as advanceEngine,
  type Circle,
  type CircleEvent,
  commitBid,
  createCircle as createEngine,
  eligibleMembers,
  maxBidBps,
  type Mode,
  swapTurns,
} from "@/lib/economics/engine";
import type { Lang } from "@/lib/i18n";
import type { DisplayCurrency } from "@/lib/money";
import { guessCurrency } from "@/lib/visitor";
import type { InviteSummary } from "./invite";
import type { Frequency, TemplateId } from "./templates";

// The demo store: everything the app shows, kept in this browser. It runs the same economics
// engine as the homepage simulation. The live app replaces it with chain reads and relayer
// writes behind the same actions; screens don't need to change.

export const YOU = "you";
const KEY = "turn-demo-v1";
const DEMO_NAMES = ["Meera", "Arjun", "Fatima", "Ravi", "Sanjay", "Aisha", "Kiran", "Deepa", "Imran", "Lakshmi"];

export type PayWith = "local" | "stablecoin";

export interface Prefs {
  language: Lang;
  currency: DisplayCurrency;
  /** How contributions are paid. Missing in data saved before it existed: treat as "local". */
  payWith?: PayWith;
}

export interface Profile {
  name: string;
  address: string;
  createdAt: number;
}

export interface MemberMeta {
  id: string;
  name: string;
}

export interface RoundLog {
  round: number;
  at: number;
  events: CircleEvent[];
  statuses: Record<string, SeatStatus>;
}

export interface CircleRec {
  id: string;
  name: string;
  template: TemplateId;
  organiser: string;
  createdAt: number;
  contribution: bigint; // AUSD base units
  n: number;
  frequency: Frequency;
  mode: Mode;
  members: MemberMeta[];
  startedAt: number | null;
  engine: Circle | null; // null while the circle is still forming
  history: RoundLog[];
  autopay: boolean;
  missNext: string[]; // demo control
  reveal: number | null; // a round whose results the user hasn't seen yet
  swap: { with: string } | null;
}

export interface State {
  v: 1;
  prefs: Prefs;
  profile: Profile | null;
  circles: Record<string, CircleRec>;
  order: string[]; // newest first
  telegram: boolean;
  metrics: { firstOpenAt: number | null; firstConfirmedAt: number | null; taps: number };
}

const EMPTY: State = {
  v: 1,
  prefs: { language: "en", currency: "USD" },
  profile: null,
  circles: {},
  order: [],
  telegram: false,
  metrics: { firstOpenAt: null, firstConfirmedAt: null, taps: 0 },
};

// ------------------------------------------------------------------ persistence

const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? { $big: v.toString() } : v);
const reviver = (_: string, v: unknown) =>
  v && typeof v === "object" && "$big" in (v as object) && Object.keys(v as object).length === 1 ? BigInt((v as { $big: string }).$big) : v;

function load(): State {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw, reviver) as State;
      if (s.v === 1) return s;
    }
  } catch {
    // Unreadable or blocked storage: start fresh.
  }
  const currency = guessCurrency(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language);
  return { ...EMPTY, prefs: { ...EMPTY.prefs, currency } };
}

let state: State = load();
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state, replacer));
  } catch {
    // Storage full or blocked: the session still works, it just won't survive a reload.
  }
  listeners.forEach((l) => l());
}

function update(id: string, fn: (c: CircleRec) => CircleRec) {
  const c = state.circles[id];
  if (!c) return;
  set({ ...state, circles: { ...state.circles, [id]: fn(c) } });
}

// ------------------------------------------------------------------ helpers

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function confirmedNow(s: State): State["metrics"] {
  return s.metrics.firstConfirmedAt ? s.metrics : { ...s.metrics, firstConfirmedAt: Date.now() };
}

function start(c: CircleRec): CircleRec {
  const engine = createEngine(
    { contribution: c.contribution, mode: c.mode, maxDiscountBps: 3000, entryDeposit: c.contribution, reserveBps: 2000 },
    c.members.map((m) => ({ id: m.id, name: m.name })),
  );
  return { ...c, engine, startedAt: Date.now() };
}

function withProfile(s: State, name: string): Profile {
  return s.profile ?? { name: name.trim() || "You", address: `0x${randomHex(20)}`, createdAt: Date.now() };
}

// ------------------------------------------------------------------ actions

export interface NewCircle {
  name: string;
  template: TemplateId;
  contribution: bigint;
  n: number;
  frequency: Frequency;
  mode: Mode;
  yourName: string;
}

export const store = {
  get: () => state,
  server: () => EMPTY,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  setPrefs(p: Partial<Prefs>) {
    set({ ...state, prefs: { ...state.prefs, ...p } });
  },

  /** First visit to the app: starts the onboarding clock. */
  markOpened() {
    if (state.profile || state.metrics.firstOpenAt) return;
    set({ ...state, metrics: { ...state.metrics, firstOpenAt: Date.now() } });
  },

  /** Counts taps on the path to the first confirmed payment (for /metrics). */
  tap() {
    if (state.metrics.firstConfirmedAt) return;
    set({ ...state, metrics: { ...state.metrics, taps: state.metrics.taps + 1 } });
  },

  createCircle(input: NewCircle): string {
    const id = `c_${randomHex(6)}`;
    const profile = withProfile(state, input.yourName);
    const rec: CircleRec = {
      id,
      name: input.name.trim() || "Our circle",
      template: input.template,
      organiser: profile.name,
      createdAt: Date.now(),
      contribution: input.contribution,
      n: input.n,
      frequency: input.frequency,
      mode: input.mode,
      members: [{ id: YOU, name: profile.name }],
      startedAt: null,
      engine: null,
      history: [],
      autopay: true,
      missNext: [],
      reveal: null,
      swap: null,
    };
    set({ ...state, profile, circles: { ...state.circles, [id]: rec }, order: [id, ...state.order], metrics: confirmedNow(state) });
    return id;
  },

  /** Demo: other people join until the circle is full, which starts it. */
  fillDemoMembers(id: string) {
    update(id, (c) => {
      const taken = new Set(c.members.map((m) => m.name));
      const names = DEMO_NAMES.filter((n) => !taken.has(n));
      const members = [...c.members];
      for (let i = members.length; i < c.n; i++) members.push({ id: `m${i}`, name: names.shift() ?? `Member ${i + 1}` });
      return start({ ...c, members });
    });
  },

  joinFromInvite(invite: InviteSummary, yourName: string): string {
    const profile = withProfile(state, yourName);
    const members: MemberMeta[] = invite.joined.map((name, i) => ({ id: `m${i}`, name }));
    members.push({ id: YOU, name: profile.name });
    let rec: CircleRec = {
      id: invite.id,
      name: invite.name,
      template: "custom",
      organiser: invite.organiser,
      createdAt: Date.now(),
      contribution: BigInt(invite.contribution),
      n: invite.n,
      frequency: invite.frequency,
      mode: invite.mode,
      members,
      startedAt: null,
      engine: null,
      history: [],
      autopay: true,
      missNext: [],
      reveal: null,
      swap: null,
    };
    if (members.length >= rec.n) rec = start(rec);
    set({ ...state, profile, circles: { ...state.circles, [rec.id]: rec }, order: [rec.id, ...state.order], metrics: confirmedNow(state) });
    return rec.id;
  },

  sealBid(id: string, bps: number) {
    update(id, (c) => (c.engine ? { ...c, engine: commitBid(c.engine, YOU, bps) } : c));
  },

  /** Demo: time passes by one period. Other members bid now and then. */
  advance(id: string) {
    update(id, (c) => {
      if (!c.engine || c.engine.status === "COMPLETED") return c;
      let engine = c.engine;
      const round = engine.round;
      if (engine.status === "ACTIVE" && engine.params.mode === "AUCTION") {
        const rand = seeded(`${c.id}:${round}`);
        for (const m of eligibleMembers(engine)) {
          if (m.id === YOU || rand() > 0.35) continue;
          const cap = Math.min(maxBidBps(engine, m.id), 800);
          if (cap >= 100) engine = commitBid(engine, m.id, Math.min(cap, 100 * (1 + Math.floor(rand() * (cap / 100)))));
        }
      }
      const missed = [...c.missNext, ...(c.autopay ? [] : [YOU])];
      const { circle: next, events } = advanceEngine(engine, { missed });
      const statuses: Record<string, SeatStatus> = {};
      for (const e of events) {
        if (e.type === "ContributionPaid") statuses[e.member] = "paid";
        if (e.type === "DefaultMarked" || e.type === "MemberEjected") statuses[e.member] = "late";
      }
      const payout = events.find((e) => e.type === "PayoutMade");
      // Show the reveal moment after every auction, and the celebration whenever you win.
      const showReveal = !!payout && (c.mode === "AUCTION" || payout.winner === YOU);
      return {
        ...c,
        engine: next,
        history: [...c.history, { round, at: Date.now(), events, statuses }],
        missNext: [],
        reveal: showReveal ? round : c.reveal,
      };
    });
  },

  toggleMiss(id: string, memberId: string) {
    update(id, (c) => ({ ...c, missNext: c.missNext.includes(memberId) ? c.missNext.filter((m) => m !== memberId) : [...c.missNext, memberId] }));
  },

  dismissReveal(id: string) {
    update(id, (c) => ({ ...c, reveal: null }));
  },

  requestSwap(id: string, other: string) {
    update(id, (c) => ({ ...c, swap: { with: other } }));
  },

  /** Demo: the other member agrees. Live, this is their own acceptSwap with Face ID. */
  completeSwap(id: string) {
    update(id, (c) => (c.engine && c.swap ? { ...c, engine: swapTurns(c.engine, YOU, c.swap.with), swap: null } : { ...c, swap: null }));
  },

  setAutopay(id: string, on: boolean) {
    update(id, (c) => ({ ...c, autopay: on }));
  },

  setName(name: string) {
    if (state.profile) set({ ...state, profile: { ...state.profile, name } });
  },

  setTelegram(on: boolean) {
    set({ ...state, telegram: on });
  },

  reset() {
    set({ ...EMPTY, prefs: state.prefs });
  },
};
