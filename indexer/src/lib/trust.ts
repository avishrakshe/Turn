// Exact port of contracts/src/libraries/TrustMath.sol (integer math, same rounding). Kept in lockstep by
// test/trust.test.ts, which checks the same vectors as contracts/test/unit/TrustMath.t.sol.

export type CreditRecord = {
  circlesJoined: bigint;
  circlesCompleted: bigint;
  paymentsOnTime: bigint;
  paymentsLate: bigint;
  defaults: bigint;
  totalContributed: bigint;
};

const BPS = 10_000n;
const MAX_TRUST_BPS = 8_000n;
const TRUST_PER_CIRCLE_BPS = 2_000n;
const TRUST_DEFAULT_PENALTY_BPS = 2_500n;
const MAX_SCORE = 1_000n;
const RATE_RAMP_PAYMENTS = 12n;

const payments = (r: CreditRecord) => r.paymentsOnTime + r.paymentsLate + r.defaults;

export function onTimeRateBps(r: CreditRecord): bigint {
  const total = payments(r);
  return total === 0n ? 0n : (r.paymentsOnTime * BPS) / total;
}

export function trustBps(r: CreditRecord): bigint {
  if (r.circlesCompleted === 0n) return 0n;
  let base = r.circlesCompleted * TRUST_PER_CIRCLE_BPS;
  if (base > MAX_TRUST_BPS) base = MAX_TRUST_BPS;
  const rate = onTimeRateBps(r);
  const t = (base * rate * rate) / (BPS * BPS);
  const penalty = r.defaults * TRUST_DEFAULT_PENALTY_BPS;
  return penalty >= t ? 0n : t - penalty;
}

export function score(r: CreditRecord): bigint {
  const p = payments(r);
  let s = r.circlesCompleted * 100n;
  if (s > 500n) s = 500n;
  const weight = p > RATE_RAMP_PAYMENTS ? RATE_RAMP_PAYMENTS : p;
  s += (onTimeRateBps(r) * 400n * weight) / (BPS * RATE_RAMP_PAYMENTS);
  s += r.paymentsOnTime > 100n ? 100n : r.paymentsOnTime;
  const penalty = r.defaults * 150n;
  if (penalty >= s) return 0n;
  s -= penalty;
  return s > MAX_SCORE ? MAX_SCORE : s;
}

/** Plain-language label shown in the app. */
export function trustLevel(trust: bigint, completed: bigint): string {
  if (completed === 0n) return "New";
  if (trust < 2_000n) return "Building";
  if (trust < 6_000n) return "Trusted";
  return "Highly trusted";
}
