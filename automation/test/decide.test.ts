import { describe, expect, it } from "vitest";
import { decodeAbiParameters, type Address } from "viem";
import {
  amountsByCurrency,
  currencyCode,
  duration,
  encodeJobs,
  formatLocal,
  jobFor,
  KeeperAction,
  messageFor,
  NextAction,
  parseRates,
  planJobs,
  type CircleSnapshot,
} from "../shared/decide.ts";

const A = "0x00000000000000000000000000000000000000a1" as Address;
const M = "0x00000000000000000000000000000000000000b2" as Address;
const rates = { INR: 95.878915, AED: 3.6725, GBP: 0.755093, EUR: 0.877506 };

const snap = (nextAction: number, extra: Partial<CircleSnapshot> = {}): CircleSnapshot => ({
  circle: A,
  nextAction,
  member: M,
  round: 2n,
  roundStart: 1_800_000_000n,
  contribution: 100_000_000n,
  auction: true,
  bidWindow: 120,
  settlement: false,
  members: [
    { address: A, currency: "INR" },
    { address: M, currency: "AED" },
    { address: A, currency: "GBP" },
  ],
  ...extra,
});

describe("decision rule", () => {
  it("maps Circle.nextAction to TurnKeeper actions", () => {
    expect(jobFor(snap(NextAction.NONE))).toBeNull();
    expect(jobFor(snap(NextAction.COLLECT))?.action).toBe(KeeperAction.COLLECT);
    expect(jobFor(snap(NextAction.CLOSE_AUCTION))?.action).toBe(KeeperAction.CLOSE_AUCTION);
    expect(jobFor(snap(NextAction.PAYOUT))?.action).toBe(KeeperAction.PAYOUT);
    expect(jobFor(snap(NextAction.MARK_DEFAULT))).toEqual({ circle: A, action: KeeperAction.MARK_DEFAULT, member: M, round: 2n });
  });

  it("caps jobs per report and keeps order", () => {
    const s = [snap(NextAction.COLLECT), snap(NextAction.NONE), snap(NextAction.PAYOUT), snap(NextAction.COLLECT)];
    const { jobs, planned } = planJobs(s, 2);
    expect(jobs.map((j) => j.action)).toEqual([KeeperAction.COLLECT, KeeperAction.PAYOUT]);
    expect(planned).toHaveLength(2);
  });

  it("encodes the report exactly as TurnKeeper decodes it: abi.encode(Job[])", () => {
    const jobs = planJobs([snap(NextAction.MARK_DEFAULT), snap(NextAction.COLLECT)], 5).jobs;
    const [decoded] = decodeAbiParameters(
      [{ type: "tuple[]", components: [{ name: "circle", type: "address" }, { name: "action", type: "uint8" }, { name: "member", type: "address" }, { name: "round", type: "uint256" }] }],
      encodeJobs(jobs),
    );
    expect(decoded.map((j) => [j.action, j.round])).toEqual([[3, 2n], [0, 0n]]);
  });
});

describe("plain-language money", () => {
  it("formats AUSD in each member's currency", () => {
    expect(formatLocal(100_000_000n, "INR", rates)).toBe("₹9,588");
    expect(formatLocal(100_000_000n, "AED", rates)).toBe("AED 367");
    expect(formatLocal(100_000_000n, "GBP", rates)).toBe("£75.51");
    expect(formatLocal(100_000_000n, "USD", rates)).toBe("$100.00");
    expect(formatLocal(100_000_000n, "JPY", rates)).toBe("$100.00"); // unknown -> USD
  });

  it("lists each currency once", () => {
    expect(amountsByCurrency(100_000_000n, snap(0).members, rates)).toBe("₹9,588 · AED 367 · £75.51");
  });

  it("writes messages without crypto jargon", () => {
    const texts = [NextAction.COLLECT, NextAction.CLOSE_AUCTION, NextAction.PAYOUT, NextAction.MARK_DEFAULT].map(
      (a) => messageFor(snap(a), rates, "Family Circle")!,
    );
    expect(texts[0]).toContain("₹9,588 · AED 367 · £75.51");
    expect(texts[0]).toContain("open for the next 2 minutes");
    expect(duration(86_400 * 30)).toBe("30 days");
    expect(duration(3_600)).toBe("1 hour");
    expect(texts[3]).toContain("everyone still receives the full pot");
    for (const t of texts) expect(t).not.toMatch(/gas|transaction|wallet|0x[0-9a-f]{40}|AUSD|Monad/i);
  });

  it("parses the FX API and decodes currencies", () => {
    expect(parseRates({ result: "success", rates: { INR: 95.8, AED: 3.67, XYZ: 1 } }, ["INR", "AED", "GBP"])).toEqual({ INR: 95.8, AED: 3.67 });
    expect(() => parseRates({}, ["INR"])).toThrow();
    expect(currencyCode("0x494e52")).toBe("INR");
    expect(currencyCode("0x000000")).toBe("USD");
  });
});
