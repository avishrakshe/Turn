import { describe, expect, it } from "vitest";
import { onTimeRateBps, score, trustBps, trustLevel, type CreditRecord } from "../src/lib/trust.ts";

const rec = (completed: number, onTime: number, late: number, defaults: number): CreditRecord => ({
  circlesJoined: BigInt(completed),
  circlesCompleted: BigInt(completed),
  paymentsOnTime: BigInt(onTime),
  paymentsLate: BigInt(late),
  defaults: BigInt(defaults),
  totalContributed: 0n,
});

// Same vectors as contracts/test/unit/TrustMath.t.sol — the indexer must show exactly what the chain uses.
describe("TrustMath port", () => {
  it("matches the Solidity trust vectors", () => {
    expect(trustBps(rec(0, 0, 0, 0))).toBe(0n);
    expect(trustBps(rec(0, 50, 0, 0))).toBe(0n);
    expect(trustBps(rec(1, 5, 0, 0))).toBe(2_000n);
    expect(trustBps(rec(4, 20, 0, 0))).toBe(8_000n);
    expect(trustBps(rec(9, 90, 0, 0))).toBe(8_000n);
    expect(trustBps(rec(2, 5, 5, 0))).toBe(1_000n);
    expect(trustBps(rec(2, 10, 0, 1))).toBe(805n);
    expect(trustBps(rec(2, 10, 0, 2))).toBe(0n);
  });

  it("matches the Solidity score vectors", () => {
    expect(score(rec(0, 0, 0, 0))).toBe(0n);
    expect(score(rec(1, 5, 0, 0))).toBe(271n);
    expect(score(rec(1, 12, 0, 0))).toBe(512n);
    expect(score(rec(10, 200, 0, 0))).toBe(1_000n);
    expect(score(rec(0, 1, 0, 0))).toBe(34n);
    expect(score(rec(0, 1, 0, 1))).toBe(0n);
    expect(score(rec(5, 60, 0, 1))).toBe(803n);
    expect(onTimeRateBps(rec(0, 10, 0, 1))).toBe(9_090n);
  });

  it("labels trust in plain language", () => {
    expect(trustLevel(0n, 0n)).toBe("New");
    expect(trustLevel(1_000n, 2n)).toBe("Building");
    expect(trustLevel(2_000n, 1n)).toBe("Trusted");
    expect(trustLevel(8_000n, 4n)).toBe("Highly trusted");
  });
});
