import { describe, expect, it } from "vitest";
import {
  advance,
  type Circle,
  type CircleEvent,
  commitBid,
  createCircle,
  eligibleMembers,
  expectedRound,
  exposure,
  maxBidBps,
  type Mode,
  netOf,
  swapTurns,
  withheldIfWinningIn,
} from "./engine";
import { score, trustBps } from "./trust";
import vectors from "./vectors.json";

type Period = { missed: string[]; bids?: Record<string, number> };

function run(v: (typeof vectors.scenarios)[number]) {
  const p = v.params;
  let c = createCircle(
    { contribution: BigInt(p.contribution), mode: p.mode as Mode, maxDiscountBps: p.maxDiscountBps, entryDeposit: BigInt(p.entryDeposit), reserveBps: p.reserveBps },
    v.members.map((id) => ({ id, name: id })),
  );
  const events: CircleEvent[] = [];
  for (const period of v.periods as Period[]) {
    for (const [id, bps] of Object.entries(period.bids ?? {})) c = commitBid(c, id, bps);
    const r = advance(c, { missed: period.missed });
    c = r.circle;
    events.push(...r.events);
  }
  return { c, events };
}

describe("TrustMath parity vectors", () => {
  for (const v of vectors.score) {
    it(v.name, () => {
      const r = { ...v.record, totalContributed: 0n };
      expect(score(r)).toBe(v.score);
      expect(trustBps(r)).toBe(v.trustBps);
    });
  }
});

describe("plan §3.4 worked ejection example", () => {
  const v = vectors.scenarios[0]!;
  const { c, events } = run(v);
  const payouts = events.filter((e) => e.type === "PayoutMade");

  it("pays the expected winners and pots (I3: pot = activeMembers·C)", () => {
    for (const [round, winner] of Object.entries(v.expect.winners)) {
      const p = payouts.find((e) => e.round === Number(round))!;
      expect(p.winner).toBe(winner);
      expect(p.pot).toBe(BigInt(v.expect.pots[round as keyof typeof v.expect.pots]));
    }
    expect(payouts).toHaveLength(4);
  });

  it("ejects E with k = 2, refunding 90%", () => {
    const e = events.find((x) => x.type === "MemberEjected")!;
    expect(e).toMatchObject({ member: "E", k: 2, refund: 180n, penalty: 20n });
  });

  it("matches the net table, and splits the penalty among members who never missed", () => {
    for (const [id, net] of Object.entries(v.expect.net)) {
      expect(netOf(c.members.find((m) => m.id === id)!), id).toBe(BigInt(net));
    }
    const done = events.find((x) => x.type === "CircleCompleted")!;
    expect(done).toMatchObject({ reserveDistributed: 20n, sharePerMember: 5n });
    expect(c.status).toBe("COMPLETED");
    expect(c.balance).toBe(BigInt(v.expect.finalBalance!));
  });
});

describe("auction discount", () => {
  const v = vectors.scenarios[1]!;
  const { c, events } = run(v);

  it("sends 20% of the discount to the reserve and splits the rest as credit", () => {
    const p = events.find((e) => e.type === "PayoutMade" && e.round === 1)!;
    const r1 = v.expect.round1!;
    expect(p).toMatchObject({
      winner: "B",
      discount: BigInt(r1.discount),
      collateralWithheld: BigInt(r1.withheld),
      netPaid: BigInt(r1.netPaid),
    });
    const credits = events.filter((e) => e.type === "CreditAccrued" && e.round === 1);
    expect(credits.map((e) => (e as { amount: bigint }).amount)).toEqual([106n, 106n, 106n]);
  });

  it("matches the expected nets", () => {
    for (const [id, net] of Object.entries(v.expect.net)) {
      expect(netOf(c.members.find((m) => m.id === id)!), id).toBe(BigInt(net));
    }
    expect(c.balance).toBe(BigInt(v.expect.finalBalance!));
  });
});

describe("bid limits", () => {
  const base = createCircle(
    { contribution: 100n, mode: "AUCTION", maxDiscountBps: 5000, entryDeposit: 100n, reserveBps: 2000 },
    ["A", "B", "C", "D", "E"].map((id) => ({ id, name: id })),
  );

  it("caps a bid so the payout still covers the withheld collateral", () => {
    // Round 1: pot 500, owes 400 more, deposit 100 → withheld 300 → at most 200/500 = 40%.
    expect(maxBidBps(base, "A")).toBe(4000);
    expect(() => commitBid(base, "A", 4001)).toThrow();
  });

  it("rejects bids from members who already won", () => {
    const { circle } = advance(base);
    const winner = circle.members.find((m) => m.wonRound === 1)!;
    expect(maxBidBps(circle, winner.id)).toBe(0);
  });
});

describe("trusted winner defaults are covered by the reserve", () => {
  it("covers a default beyond the collateral from the reserve, never shrinking the pot", () => {
    let c = createCircle(
      { contribution: 1000n, mode: "AUCTION", maxDiscountBps: 5000, entryDeposit: 1000n, reserveBps: 10_000 },
      [
        { id: "T", name: "T", trustBps: 8000, score: 900 },
        { id: "A", name: "A" },
        { id: "B", name: "B" },
        { id: "C", name: "C" },
      ],
    );
    c = commitBid(c, "A", 2500); // 1000 discount, all of it to the reserve
    c = advance(c).circle;
    expect(c.reserve).toBe(1000n);
    c = advance(c).circle; // T wins round 2 (highest score), owes 2000, waiver up to 1000
    const t = c.members.find((m) => m.id === "T")!;
    expect(t.wonRound).toBe(2);
    expect(t.debt - t.collateral).toBe(1000n);
    expect(exposure(c)).toBeLessThanOrEqual(c.reserve);
    // First miss: the 1000 of collateral covers it.
    let r = advance(c, { missed: ["T"] });
    expect(r.events.find((e) => e.type === "DefaultMarked")).toMatchObject({ member: "T", fromCollateral: 1000n, fromReserve: 0n });
    expect(r.events.find((e) => e.type === "PayoutMade")).toMatchObject({ pot: 4000n });
    // Second miss: collateral is gone, the waived part comes from the reserve.
    r = advance(r.circle, { missed: ["T"] });
    expect(r.events.find((e) => e.type === "DefaultMarked")).toMatchObject({ member: "T", fromCollateral: 0n, fromReserve: 1000n });
    expect(r.events.find((e) => e.type === "PayoutMade")).toMatchObject({ pot: 4000n });
  });
});

describe("swapping turns", () => {
  const fixed = () =>
    createCircle(
      { contribution: 100n, mode: "FIXED_ORDER", maxDiscountBps: 0, entryDeposit: 100n, reserveBps: 2000 },
      ["A", "B", "C", "D"].map((id) => ({ id, name: id })),
    );

  it("exchanges the two members' rounds and the collateral that goes with them", () => {
    let c = fixed();
    expect(expectedRound(c, "B")).toBe(2);
    expect(expectedRound(c, "D")).toBe(4);
    expect(withheldIfWinningIn(c, "D", 2)).toBe(100n); // owes 2 more rounds, deposit covers 1
    c = swapTurns(c, "B", "D");
    expect(expectedRound(c, "D")).toBe(2);
    expect(expectedRound(c, "B")).toBe(4);
    c = advance(c).circle; // A
    const r2 = advance(c).events.find((e) => e.type === "PayoutMade")!;
    expect(r2).toMatchObject({ winner: "D", collateralWithheld: 100n });
  });

  it("refuses swaps with a member who already had their turn, or in auction circles", () => {
    const c = advance(fixed()).circle;
    expect(() => swapTurns(c, "A", "B")).toThrow();
    const auction = createCircle({ ...fixed().params, mode: "AUCTION" }, ["A", "B", "C"].map((id) => ({ id, name: id })));
    expect(() => swapTurns(auction, "A", "B")).toThrow();
  });
});

// ---------------------------------------------------------------- property tests

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("invariants hold across random circles", () => {
  it("I0 balance, I1 exposure ≤ reserve, I3 pots, and no honest member loses money", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const rand = rng(seed);
      const n = 3 + Math.floor(rand() * 8);
      const C = BigInt(1 + Math.floor(rand() * 5000));
      const mode: Mode = rand() < 0.75 ? "AUCTION" : "FIXED_ORDER";
      let c: Circle = createCircle(
        { contribution: C, mode, maxDiscountBps: Math.floor(rand() * 5001), entryDeposit: C, reserveBps: Math.floor(rand() * 10_001) },
        Array.from({ length: n }, (_, i) => ({
          id: `m${i}`,
          name: `m${i}`,
          trustBps: rand() < 0.5 ? Math.floor(rand() * 8001) : 0,
          score: Math.floor(rand() * 1001),
        })),
      );
      const missProb = rand() * 0.3;
      let guard = 0;
      while (c.status !== "COMPLETED") {
        if (++guard > 100) throw new Error(`seed ${seed}: circle did not finish`);
        if (c.status === "ACTIVE" && mode === "AUCTION") {
          for (const m of eligibleMembers(c)) {
            const cap = maxBidBps(c, m.id);
            if (cap > 0 && rand() < 0.4) c = commitBid(c, m.id, 1 + Math.floor(rand() * cap));
          }
        }
        const missed = c.members.filter(() => rand() < missProb).map((m) => m.id);
        const r = advance(c, { missed }); // advance() asserts I0, I1, I3 internally
        for (const e of r.events) if (e.type === "PayoutMade") expect(e.pot % C).toBe(0n);
        c = r.circle;
      }
      // Everything was paid out except rounding dust left in the reserve.
      expect(c.balance, `seed ${seed}`).toBe(c.reserve);
      expect(c.reserve, `seed ${seed}`).toBeLessThan(BigInt(n));
      // I2: a member who never missed only ever gives up the discount they chose to bid.
      for (const m of c.members) {
        if (m.ejected) continue;
        if (m.defaults === 0) expect(netOf(m) + m.discountPaid, `seed ${seed} ${m.id}`).toBeGreaterThanOrEqual(0n);
      }
    }
  });
});
