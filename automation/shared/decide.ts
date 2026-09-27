// One decision rule for both keepers: the Chainlink CRE workflow (primary) and the Node fallback keeper.
// Pure and dependency-light on purpose: it runs inside CRE's WASM (QuickJS) runtime, so no Node or browser APIs.
import { encodeAbiParameters, type Address, type Hex } from "viem";

/** Circle.NextAction (contracts/src/Circle.sol) */
export const NextAction = { NONE: 0, COLLECT: 1, CLOSE_AUCTION: 2, MARK_DEFAULT: 3, PAYOUT: 4 } as const;
/** TurnKeeper.Action (contracts/src/TurnKeeper.sol) */
export const KeeperAction = { COLLECT: 0, CLOSE_AUCTION: 1, PAYOUT: 2, MARK_DEFAULT: 3 } as const;

export type Job = { circle: Address; action: number; member: Address; round: bigint };

export type MemberSnapshot = { address: Address; currency: string };

/** What a keeper reads from one circle before deciding. */
export type CircleSnapshot = {
  circle: Address;
  nextAction: number;
  member: Address; // MARK_DEFAULT target
  round: bigint;
  roundStart: bigint;
  contribution: bigint; // token units, 6 decimals
  auction: boolean;
  bidWindow: number;
  settlement: boolean;
  members: MemberSnapshot[];
};

const ZERO: Address = "0x0000000000000000000000000000000000000000";

/** Map the circle's own `nextAction()` to a TurnKeeper job, or null if nothing is due. */
export function jobFor(s: CircleSnapshot): Job | null {
  switch (s.nextAction) {
    case NextAction.COLLECT:
      return { circle: s.circle, action: KeeperAction.COLLECT, member: ZERO, round: 0n };
    case NextAction.CLOSE_AUCTION:
      return { circle: s.circle, action: KeeperAction.CLOSE_AUCTION, member: ZERO, round: 0n };
    case NextAction.PAYOUT:
      return { circle: s.circle, action: KeeperAction.PAYOUT, member: ZERO, round: 0n };
    case NextAction.MARK_DEFAULT:
      return { circle: s.circle, action: KeeperAction.MARK_DEFAULT, member: s.member, round: s.round };
    default:
      return null;
  }
}

/** Plan at most `maxJobs` jobs across circles (oldest-first order is kept, so no circle starves). */
export function planJobs(snapshots: CircleSnapshot[], maxJobs: number): { jobs: Job[]; planned: CircleSnapshot[] } {
  const jobs: Job[] = [];
  const planned: CircleSnapshot[] = [];
  for (const s of snapshots) {
    if (jobs.length >= maxJobs) break;
    const j = jobFor(s);
    if (j) {
      jobs.push(j);
      planned.push(s);
    }
  }
  return { jobs, planned };
}

/** The report TurnKeeper.onReport decodes: abi.encode(Job[]). */
export function encodeJobs(jobs: Job[]): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { name: "circle", type: "address" },
          { name: "action", type: "uint8" },
          { name: "member", type: "address" },
          { name: "round", type: "uint256" },
        ],
      },
    ],
    [jobs],
  );
}

// ---- plain-language notifications (the user never sees "gas", "tx" or chain names) ----------------------

export type Rates = Record<string, number>; // units of currency per 1 USD

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", GBP: "£", EUR: "€", AED: "AED " };

/** 6-decimal AUSD amount -> "₹9,588" / "AED 367" / "£75.51", using USD rates (AUSD is a USD stablecoin). */
export function formatLocal(amount6: bigint, currency: string, rates: Rates): string {
  const usd = Number(amount6) / 1e6;
  const rate = currency === "USD" ? 1 : rates[currency];
  if (rate === undefined) return `$${usd.toFixed(2)}`;
  const value = usd * rate;
  const whole = currency === "INR"; // rupees are shown whole; AED/GBP/EUR/USD keep 2 decimals
  const n = whole ? Math.round(value).toString() : value.toFixed(2);
  const [int, frac] = n.split(".");
  const grouped = (int ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${SYMBOL[currency] ?? `${currency} `}${grouped}${frac ? `.${frac}` : ""}`;
}

/** Each member's contribution in their own currency, deduplicated: "₹9,588 · AED 367 · £75.51". */
export function amountsByCurrency(amount6: bigint, members: MemberSnapshot[], rates: Rates): string {
  const seen: string[] = [];
  for (const m of members) if (!seen.includes(m.currency)) seen.push(m.currency);
  if (seen.length === 0) seen.push("USD");
  return seen.map((c) => formatLocal(amount6, c, rates)).join(" · ");
}

const short = (a: Address) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** 120 -> "2 minutes", 86400 -> "1 day". Relative, because members live in different time zones. */
export function duration(seconds: number): string {
  const units: [number, string][] = [
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
  ];
  for (const [s, name] of units) {
    if (seconds >= s) {
      const n = Math.round(seconds / s);
      return `${n} ${name}${n === 1 ? "" : "s"}`;
    }
  }
  return `${seconds} seconds`;
}

/** Message for the circle's chat when a keeper runs `job` (sent only after the action succeeded onchain). */
export function messageFor(s: CircleSnapshot, rates: Rates, name = "your circle"): string | null {
  const each = amountsByCurrency(s.contribution, s.members, rates);
  const pot = amountsByCurrency(s.contribution * BigInt(s.members.length), s.members, rates);
  switch (s.nextAction) {
    case NextAction.COLLECT:
      if (s.settlement) return `🔁 ${name}: settling up after a member left. Repayments were collected automatically.`;
      return (
        `🔔 ${name}, round ${s.round}: contributions of ${each} were collected by auto-pay.` +
        (s.auction ? ` Bidding for this round's pot (${pot}) is open for the next ${duration(s.bidWindow)}.` : "")
      );
    case NextAction.CLOSE_AUCTION:
      return `🔨 ${name}, round ${s.round}: bidding has closed. The pot goes out as soon as everyone has paid.`;
    case NextAction.PAYOUT:
      if (s.settlement) return `✅ ${name} is complete. Everyone can now withdraw what's left for them.`;
      return `🎉 ${name}, round ${s.round}: the pot has been paid out. Next round starts on schedule.`;
    case NextAction.MARK_DEFAULT:
      return (
        `⚠️ ${name}, round ${s.round}: a payment from ${short(s.member)} didn't arrive in time. ` +
        `It was covered by their deposit or collateral, so everyone still receives the full pot.`
      );
    default:
      return null;
  }
}

/** Parse https://open.er-api.com/v6/latest/USD into the currencies Turn displays. */
export function parseRates(body: unknown, currencies: string[]): Rates {
  const rates = (body as { result?: string; rates?: Record<string, number> })?.rates;
  if (!rates) throw new Error("FX response has no rates");
  const out: Rates = {};
  for (const c of currencies) {
    const r = rates[c];
    if (typeof r === "number" && r > 0) out[c] = r;
  }
  return out;
}

/** bytes3 hex ("0x494e52") -> "INR"; anything else -> "USD". */
export function currencyCode(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const c = parseInt(clean.slice(i, i + 2), 16);
    if (c >= 65 && c <= 90) out += String.fromCharCode(c);
  }
  return out.length === 3 ? out : "USD";
}
