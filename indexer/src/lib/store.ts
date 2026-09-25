// Small read-modify-write helpers shared by handlers.
import type { Circle, EvmOnEventContext, GlobalStats, Member, Membership } from "envio";
import { GLOBAL_ID, emptyGlobal, emptyMember, healthScore } from "./util.ts";

type Ctx = EvmOnEventContext;

export async function updateGlobal(context: Ctx, now: bigint, fn: (g: GlobalStats) => Partial<GlobalStats>) {
  const g = (await context.GlobalStats.get(GLOBAL_ID)) ?? emptyGlobal(now);
  const next = { ...g, ...fn(g), updatedAt: now };
  const total = next.paymentsOnTime + next.paymentsLate + next.defaults;
  next.onTimeRateBps = total === 0 ? 10_000 : Math.floor((next.paymentsOnTime * 10_000) / total);
  context.GlobalStats.set(next);
}

/** Load a member, creating (and counting) them the first time they appear anywhere in Turn. */
export async function ensureMember(context: Ctx, id: string, now: bigint): Promise<Member> {
  const existing = await context.Member.get(id);
  if (existing) return existing;
  const m = emptyMember(id, now);
  context.Member.set(m);
  await updateGlobal(context, now, (g) => ({ members: g.members + 1 }));
  return m;
}

export async function updateMember(context: Ctx, id: string, now: bigint, fn: (m: Member) => Partial<Member>) {
  const m = await ensureMember(context, id, now);
  context.Member.set({ ...m, ...fn(m), lastActiveAt: now });
}

export async function updateCircle(context: Ctx, id: string, fn: (c: Circle) => Partial<Circle>) {
  const c = await context.Circle.get(id);
  if (!c) {
    context.log.warn(`event for unknown circle ${id}`);
    return undefined;
  }
  const next = { ...c, ...fn(c) };
  next.healthScore = healthScore(next.onTimePayments, next.latePayments, next.defaults, next.ejections);
  context.Circle.set(next);
  return next;
}

export async function updateMembership(context: Ctx, id: string, fn: (m: Membership) => Partial<Membership>) {
  const m = await context.Membership.get(id);
  if (!m) {
    context.log.warn(`event for unknown membership ${id}`);
    return undefined;
  }
  const next = { ...m, ...fn(m) };
  context.Membership.set(next);
  return next;
}
