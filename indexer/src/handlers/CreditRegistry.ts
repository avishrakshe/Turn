import { indexer } from "envio";
import { updateMember } from "../lib/store.ts";
import { onTimeRateBps, score, trustBps, trustLevel } from "../lib/trust.ts";
import { ts } from "../lib/util.ts";

// The registry is the source of truth for cross-circle credit; score and trust use the exact onchain formulas.
indexer.onEvent({ contract: "CreditRegistry", event: "RecordUpdated" }, async ({ event, context }) => {
  const r = event.params.record;
  const trust = trustBps(r);
  await updateMember(context, event.params.account, ts(event.block.timestamp), () => ({
    circlesJoined: Number(r.circlesJoined),
    circlesCompleted: Number(r.circlesCompleted),
    paymentsOnTime: Number(r.paymentsOnTime),
    paymentsLate: Number(r.paymentsLate),
    defaults: Number(r.defaults),
    totalContributed: r.totalContributed,
    onTimeRateBps: Number(onTimeRateBps(r)),
    creditScore: Number(score(r)),
    trustBps: Number(trust),
    trustLevel: trustLevel(trust, r.circlesCompleted),
  }));
});
