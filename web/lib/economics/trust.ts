// TypeScript port of TrustMath (contracts/src/libraries/TrustMath.sol, not yet written).
// Integer-only, floor division, so the Solidity version can match it exactly.
// Shared test vectors: ./vectors.json. Any change here must change both.

export interface CreditRecord {
  circlesJoined: number;
  circlesCompleted: number;
  paymentsOnTime: number;
  paymentsLate: number;
  defaults: number;
  totalContributed: bigint;
}

export const SCORE_MAX = 1000;
export const TRUST_CAP_BPS = 8000;

/**
 * Turn Score, 0..1000.
 *  - reliability: share of payments made on time, worth up to 400
 *  - experience: 150 per completed circle, up to 4 circles (600)
 *  - each default costs 200
 * No payment history → 0.
 */
export function score(r: CreditRecord): number {
  const payments = r.paymentsOnTime + r.paymentsLate + r.defaults;
  if (payments === 0) return 0;
  const reliability = Math.floor((r.paymentsOnTime * 400) / payments);
  const experience = Math.min(r.circlesCompleted, 4) * 150;
  const s = reliability + experience - r.defaults * 200;
  return Math.max(0, Math.min(SCORE_MAX, s));
}

/** Share of collateral the reserve may waive, in bps. New users get 0; capped at 80%. */
export function trustBps(r: CreditRecord): number {
  if (r.circlesCompleted === 0) return 0;
  return Math.min(TRUST_CAP_BPS, score(r) * 8);
}
