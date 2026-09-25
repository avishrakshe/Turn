import type { GlobalStats, Member } from "envio";

export const GLOBAL_ID = "global";

export const ts = (t: number) => BigInt(t);

export const circleRoundId = (circle: string, round: bigint | number) => `${circle}-${round.toString()}`;
export const membershipId = (circle: string, member: string) => `${circle}-${member}`;
export const eventId = (e: { block: { number: number }; logIndex: number }) => `${e.block.number}_${e.logIndex}`;

/** bytes3 display currency (e.g. 0x494e52) -> "INR". Unknown/empty -> "USD". */
export function currencyCode(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const c = parseInt(clean.slice(i, i + 2), 16);
    if (c >= 65 && c <= 90) out += String.fromCharCode(c);
  }
  return out.length === 3 ? out : "USD";
}

export function emptyGlobal(now: bigint): GlobalStats {
  return {
    id: GLOBAL_ID,
    circlesCreated: 0,
    circlesActive: 0,
    circlesCompleted: 0,
    members: 0,
    totalSaved: 0n,
    totalPaidOut: 0n,
    totalDiscount: 0n,
    paymentsOnTime: 0,
    paymentsLate: 0,
    defaults: 0,
    ejections: 0,
    onTimeRateBps: 10_000,
    crossBorderVolume: 0n,
    activeSessions: 0,
    updatedAt: now,
  };
}

export function emptyMember(id: string, now: bigint): Member {
  return {
    id,
    circlesJoined: 0,
    circlesActive: 0,
    circlesCompleted: 0,
    paymentsOnTime: 0,
    paymentsLate: 0,
    defaults: 0,
    totalContributed: 0n,
    totalReceived: 0n,
    onTimeRateBps: 0,
    creditScore: 0,
    trustBps: 0,
    trustLevel: "New",
    displayCurrency: "USD",
    firstSeenAt: now,
    lastActiveAt: now,
  };
}

export function onTimeRate(onTime: number, late: number, defaults: number): number {
  const total = onTime + late + defaults;
  return total === 0 ? 10_000 : Math.floor((onTime * 10_000) / total);
}

/** 0-100: on-time payments count fully, late ones 60%, defaults 0; each ejection costs 15 points. */
export function healthScore(onTime: number, late: number, defaults: number, ejections: number): number {
  const total = onTime + late + defaults;
  const base = total === 0 ? 100 : Math.floor((onTime * 100 + late * 60) / total);
  return Math.max(0, Math.min(100, base - ejections * 15));
}
