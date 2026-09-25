import { indexer } from "envio";
import { ensureMember, updateGlobal } from "../lib/store.ts";
import { ts } from "../lib/util.ts";

// Every circle is a clone deployed by the factory: start indexing it from the creation block.
indexer.contractRegister({ contract: "CircleFactory", event: "CircleCreated" }, async ({ event, context }) => {
  context.chain.Circle.add(event.params.circle);
});

indexer.onEvent(
  { contract: "CircleFactory", event: "CircleCreated" },
  async ({ event, context }) => {
    const now = ts(event.block.timestamp);
    const p = event.params.params;
    await ensureMember(context, event.params.creator, now);
    context.Circle.set({
      id: event.params.circle,
      creator_id: event.params.creator,
      mode: p.mode === 1n ? "Auction" : "FixedOrder",
      status: "Forming",
      size: Number(p.n),
      contribution: p.contribution,
      period: Number(p.period),
      maxDiscountBps: Number(p.maxDiscountBps),
      bidWindow: Number(p.bidWindow),
      gracePeriod: Number(p.gracePeriod),
      entryDeposit: p.entryDeposit,
      reserveBps: Number(p.reserveBps),
      inviteHash: event.params.inviteHash,
      memberCount: 0,
      activeCount: 0,
      currentRound: 0,
      totalRounds: Number(p.n),
      inSettlement: false,
      startTime: undefined,
      createdAt: now,
      createdTx: event.transaction.hash,
      completedAt: undefined,
      collected: 0n,
      expected: 0n,
      onTimePayments: 0,
      latePayments: 0,
      defaults: 0,
      ejections: 0,
      healthScore: 100,
      reserveBalance: 0n,
      exposure: 0n,
      totalPaidOut: 0n,
      totalDiscount: 0n,
      currencies: [],
    });
    await updateGlobal(context, now, (g) => ({ circlesCreated: g.circlesCreated + 1 }));
  },
);
