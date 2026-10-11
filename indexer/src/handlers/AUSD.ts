// AUSD moving directly between people: Turn's "send to a circle member" flow, and test AUSD from Agora's faucet.
// Every AUSD transfer is seen, but only those touching a Turn member are stored, and transfers to or from a circle
// (contributions, payouts, refunds) are skipped because the Circle handlers already record them.
import { indexer } from "envio";
import { eventId, ts } from "../lib/util.ts";

indexer.onEvent({ contract: "AUSD", event: "Transfer" }, async ({ event, context }) => {
  const { from, to, value } = event.params;
  const [fromMember, toMember] = await Promise.all([context.Member.get(from), context.Member.get(to)]);
  if (!fromMember && !toMember) return;
  const [fromCircle, toCircle] = await Promise.all([context.Circle.get(from), context.Circle.get(to)]);
  if (fromCircle || toCircle) return;
  context.Transfer.set({
    id: eventId(event),
    from,
    to,
    amount: value,
    timestamp: ts(event.block.timestamp),
    txHash: event.transaction.hash,
  });
});