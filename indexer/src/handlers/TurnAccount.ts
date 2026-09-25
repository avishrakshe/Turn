// Auto-pay sessions. TurnAccount runs as each member's own EOA (EIP-7702), so these events are emitted at the
// member's address; `event.srcAddress` is the member.
import { indexer } from "envio";
import { updateGlobal } from "../lib/store.ts";
import { ts } from "../lib/util.ts";

const sessionId = (account: string, circle: string) => `${account}-${circle}`;

indexer.onEvent({ contract: "TurnAccount", event: "PullGranted" }, async ({ event, context }) => {
  const now = ts(event.block.timestamp);
  const id = sessionId(event.srcAddress, event.params.circle);
  const prev = await context.Session.get(id);
  context.Session.set({
    id,
    account_id: event.srcAddress,
    circle_id: event.params.circle,
    maxAmount: event.params.maxAmount,
    period: Number(event.params.period),
    validUntil: event.params.validUntil,
    active: true,
    pulls: 0,
    totalPulled: prev?.totalPulled ?? 0n,
    grantedAt: now,
    lastPullAt: prev?.lastPullAt,
    revokedAt: undefined,
  });
  if (!prev?.active) await updateGlobal(context, now, (g) => ({ activeSessions: g.activeSessions + 1 }));
});

indexer.onEvent({ contract: "TurnAccount", event: "PullRevoked" }, async ({ event, context }) => {
  const now = ts(event.block.timestamp);
  const s = await context.Session.get(sessionId(event.srcAddress, event.params.circle));
  if (!s) return;
  context.Session.set({ ...s, active: false, revokedAt: now });
  if (s.active) await updateGlobal(context, now, (g) => ({ activeSessions: Math.max(0, g.activeSessions - 1) }));
});

indexer.onEvent({ contract: "TurnAccount", event: "Pulled" }, async ({ event, context }) => {
  const s = await context.Session.get(sessionId(event.srcAddress, event.params.circle));
  if (!s) return;
  context.Session.set({
    ...s,
    pulls: s.pulls + 1,
    totalPulled: s.totalPulled + event.params.amount,
    lastPullAt: ts(event.block.timestamp),
  });
});
