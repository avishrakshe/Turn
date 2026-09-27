import { indexer, type Round } from "envio";
import { ensureMember, updateCircle, updateGlobal, updateMember, updateMembership } from "../lib/store.ts";
import { circleRoundId, currencyCode, eventId, membershipId, ts } from "../lib/util.ts";



// ---- membership ---------------------------------------------------------------------------------

// Each member's EIP-7702 account emits auto-pay (TurnAccount) events at their own address: index it from joining on.
indexer.contractRegister({ contract: "Circle", event: "Joined" }, async ({ event, context }) => {
  context.chain.TurnAccount.add(event.params.member);
});

indexer.onEvent({ contract: "Circle", event: "Joined" }, async ({ event, context }) => {
  const now = ts(event.block.timestamp);
  const circleId = event.srcAddress;
  const ccy = currencyCode(event.params.displayCurrency);
  await ensureMember(context, event.params.member, now);
  const circle = await updateCircle(context, circleId, (c) => ({
    memberCount: c.memberCount + 1,
    currencies: c.currencies.includes(ccy) ? c.currencies : [...c.currencies, ccy],
  }));
  context.Membership.set({
    id: membershipId(circleId, event.params.member),
    circle_id: circleId,
    member_id: event.params.member,
    joinIndex: (circle?.memberCount ?? 1) - 1,
    status: "Active",
    displayCurrency: ccy,
    hasWon: false,
    wonRound: undefined,
    deposit: event.params.deposit,
    collateral: 0n,
    credit: 0n,
    paymentsOnTime: 0,
    paymentsLate: 0,
    defaults: 0,
    totalPaid: 0n,
    received: 0n,
    claimed: 0n,
    refundDue: 0n,
    repayOwed: 0n,
    joinedAt: now,
  });
  await updateMember(context, event.params.member, now, () => ({ displayCurrency: ccy }));
});

indexer.onEvent({ contract: "Circle", event: "Left" }, async ({ event, context }) => {
  await updateMembership(context, membershipId(event.srcAddress, event.params.member), () => ({
    status: "Left",
    deposit: 0n,
  }));
  await updateCircle(context, event.srcAddress, (c) => ({ memberCount: c.memberCount - 1 }));
});

indexer.onEvent({ contract: "Circle", event: "MemberProfileSet" }, async ({ event, context }) => {
  const now = ts(event.block.timestamp);
  const ccy = currencyCode(event.params.displayCurrency);
  await updateMembership(context, membershipId(event.srcAddress, event.params.member), () => ({ displayCurrency: ccy }));
  await updateMember(context, event.params.member, now, () => ({ displayCurrency: ccy }));
  await updateCircle(context, event.srcAddress, (c) => ({
    currencies: c.currencies.includes(ccy) ? c.currencies : [...c.currencies, ccy],
  }));
});

// ---- lifecycle ----------------------------------------------------------------------------------

indexer.onEvent({ contract: "Circle", event: "CircleStarted" }, async ({ event, context }) => {
  const now = ts(event.block.timestamp);
  await updateCircle(context, event.srcAddress, (c) => ({
    status: "Active",
    startTime: event.params.startTime,
    activeCount: event.params.members.length,
    totalRounds: c.size,
  }));
  for (const m of event.params.members) {
    await updateMember(context, m, now, (x) => ({ circlesActive: x.circlesActive + 1 }));
  }
  await updateGlobal(context, now, (g) => ({ circlesActive: g.circlesActive + 1 }));
});

indexer.onEvent({ contract: "Circle", event: "RoundOpened" }, async ({ event, context }) => {
  const { round, start, settlement, potTarget } = event.params;
  context.Round.set({
    id: circleRoundId(event.srcAddress, round),
    circle_id: event.srcAddress,
    number: Number(round),
    start,
    settlement,
    status: settlement ? "Settlement" : "Open",
    potTarget,
    collected: 0n,
    paidCount: 0,
    bidCount: 0,
    bestBidBps: undefined,
    bestBidder_id: undefined,
    winner_id: undefined,
    discountBps: undefined,
    noBids: undefined,
    pot: undefined,
    discount: undefined,
    toReserve: undefined,
    collateralRequired: undefined,
    trustWaiver: undefined,
    netPaid: undefined,
    paidOutAt: undefined,
  });
  await updateCircle(context, event.srcAddress, (c) => ({
    currentRound: Number(round),
    inSettlement: settlement,
    expected: settlement ? c.expected : c.expected + potTarget,
  }));
});

indexer.onEvent({ contract: "Circle", event: "CircleCompleted" }, async ({ event, context }) => {
  const now = ts(event.block.timestamp);
  await updateCircle(context, event.srcAddress, () => ({ status: "Completed", completedAt: now, inSettlement: false }));
  const seats = await context.Membership.getWhere({ circle_id: { _eq: event.srcAddress } });
  for (const s of seats) {
    if (s.status === "Active") await updateMember(context, s.member_id, now, (m) => ({ circlesActive: Math.max(0, m.circlesActive - 1) }));
  }
  await updateGlobal(context, now, (g) => ({
    circlesActive: Math.max(0, g.circlesActive - 1),
    circlesCompleted: g.circlesCompleted + 1,
  }));
});

// ---- contributions --------------------------------------------------------------------------------

indexer.onEvent({ contract: "Circle", event: "ContributionPaid" }, async ({ event, context }) => {
  const now = ts(event.block.timestamp);
  const { member, round, amount, creditUsed, onTime } = event.params;
  const roundId = circleRoundId(event.srcAddress, round);
  const r = await context.Round.get(roundId);
  const seat = await updateMembership(context, membershipId(event.srcAddress, member), (s) => ({
    paymentsOnTime: s.paymentsOnTime + (onTime ? 1 : 0),
    paymentsLate: s.paymentsLate + (onTime ? 0 : 1),
    totalPaid: s.totalPaid + amount,
    credit: s.credit > creditUsed ? s.credit - creditUsed : 0n,
  }));
  context.Payment.set({
    id: eventId(event),
    circle_id: event.srcAddress,
    round_id: roundId,
    member_id: member,
    kind: "Paid",
    amount,
    creditUsed,
    onTime,
    fromDeposit: 0n,
    fromCollateral: 0n,
    fromReserve: 0n,
    settlement: r?.settlement ?? false,
    currency: seat?.displayCurrency ?? "USD",
    timestamp: now,
    txHash: event.transaction.hash,
  });
  if (r) context.Round.set({ ...r, collected: r.collected + amount, paidCount: r.paidCount + 1 });
  await updateCircle(context, event.srcAddress, (c) => ({
    collected: c.collected + amount,
    onTimePayments: c.onTimePayments + (onTime ? 1 : 0),
    latePayments: c.latePayments + (onTime ? 0 : 1),
  }));
  await updateGlobal(context, now, (g) => ({
    totalSaved: g.totalSaved + amount,
    paymentsOnTime: g.paymentsOnTime + (onTime ? 1 : 0),
    paymentsLate: g.paymentsLate + (onTime ? 0 : 1),
  }));
});

indexer.onEvent({ contract: "Circle", event: "CreditAccrued" }, async ({ event, context }) => {
  await updateMembership(context, membershipId(event.srcAddress, event.params.member), (s) => ({
    credit: s.credit + event.params.amount,
  }));
});

// ---- auction --------------------------------------------------------------------------------------

indexer.onEvent({ contract: "Circle", event: "BidPlaced" }, async ({ event, context }) => {
  const { member, round, discountBps } = event.params;
  const roundId = circleRoundId(event.srcAddress, round);
  const bps = Number(discountBps);
  context.Bid.set({
    id: eventId(event),
    circle_id: event.srcAddress,
    round_id: roundId,
    member_id: member,
    discountBps: bps,
    timestamp: ts(event.block.timestamp),
    txHash: event.transaction.hash,
  });
  const r = await context.Round.get(roundId);
  if (!r) return;
  // Highest discount leads; an equal later bid doesn't take the lead (ties go to the earliest bid).
  const leads = r.bestBidBps === undefined || bps > r.bestBidBps;
  context.Round.set({
    ...r,
    bidCount: r.bidCount + 1,
    bestBidBps: leads ? bps : r.bestBidBps,
    bestBidder_id: leads ? member : r.bestBidder_id,
  });
});

indexer.onEvent({ contract: "Circle", event: "AuctionClosed" }, async ({ event, context }) => {
  const r = await context.Round.get(circleRoundId(event.srcAddress, event.params.round));
  if (!r) return;
  context.Round.set({
    ...r,
    status: "AuctionClosed",
    winner_id: event.params.winner,
    discountBps: Number(event.params.discountBps),
    noBids: event.params.noBids,
  });
});

// ---- payout & corridors ---------------------------------------------------------------------------

indexer.onEvent({ contract: "Circle", event: "PayoutMade" }, async ({ event, context }) => {
  const now = ts(event.block.timestamp);
  const { winner, round, pot, discount, toReserve, collateralRequired, trustWaiver, netPaid } = event.params;
  const circleId = event.srcAddress;
  const roundId = circleRoundId(circleId, round);
  const gross = pot - discount;

  const seat = await updateMembership(context, membershipId(circleId, winner), () => ({
    hasWon: true,
    wonRound: Number(round),
    received: gross,
    deposit: 0n,
    collateral: collateralRequired,
  }));
  const winnerCcy = seat?.displayCurrency ?? "USD";
  context.Payout.set({
    id: eventId(event),
    circle_id: circleId,
    round_id: roundId,
    winner_id: winner,
    pot,
    discount,
    toReserve,
    collateralRequired,
    trustWaiver,
    netPaid,
    currency: winnerCcy,
    timestamp: now,
    txHash: event.transaction.hash,
  });
  const r = await context.Round.get(roundId);
  if (r) {
    context.Round.set({
      ...r,
      status: "PaidOut",
      winner_id: winner,
      discountBps: pot === 0n ? 0 : Number((discount * 10_000n) / pot),
      pot,
      discount,
      toReserve,
      collateralRequired,
      trustWaiver,
      netPaid,
      paidOutAt: now,
    });
  }
  await updateMember(context, winner, now, (m) => ({ totalReceived: m.totalReceived + gross }));
  await updateCircle(context, circleId, (c) => ({
    totalPaidOut: c.totalPaidOut + gross,
    totalDiscount: c.totalDiscount + discount,
  }));

  // Corridors: every contribution in this round flowed from its payer's currency to the recipient's.
  const payments = await context.Payment.getWhere({ round_id: { _eq: roundId } });
  let crossBorder = 0n;
  for (const p of payments) {
    const id = `${p.currency}-${winnerCcy}`;
    const isCross = p.currency !== winnerCcy;
    if (isCross) crossBorder += p.amount;
    const markerId = `${id}-${circleId}`;
    const firstForCircle = !(await context.CorridorCircle.get(markerId));
    if (firstForCircle) context.CorridorCircle.set({ id: markerId });
    const s = await context.CorridorStats.get(id);
    context.CorridorStats.set({
      id,
      fromCurrency: p.currency,
      toCurrency: winnerCcy,
      crossBorder: isCross,
      volume: (s?.volume ?? 0n) + p.amount,
      transfers: (s?.transfers ?? 0) + 1,
      circles: (s?.circles ?? 0) + (firstForCircle ? 1 : 0),
      updatedAt: now,
    });
  }
  await updateGlobal(context, now, (g) => ({
    totalPaidOut: g.totalPaidOut + gross,
    totalDiscount: g.totalDiscount + discount,
    crossBorderVolume: g.crossBorderVolume + crossBorder,
  }));
});

// ---- collateral & reserve -----------------------------------------------------------------------

indexer.onEvent({ contract: "Circle", event: "CollateralPosted" }, async ({ event, context }) => {
  await updateMembership(context, membershipId(event.srcAddress, event.params.member), (s) => ({
    collateral: s.collateral + event.params.amount,
  }));
});

indexer.onEvent({ contract: "Circle", event: "CollateralReleased" }, async ({ event, context }) => {
  await updateMembership(context, membershipId(event.srcAddress, event.params.member), (s) => ({
    collateral: s.collateral > event.params.amount ? s.collateral - event.params.amount : 0n,
  }));
});

indexer.onEvent({ contract: "Circle", event: "DepositRebated" }, async ({ event, context }) => {
  await updateMembership(context, membershipId(event.srcAddress, event.params.member), (s) => ({
    deposit: s.deposit > event.params.amount ? s.deposit - event.params.amount : 0n,
  }));
});

indexer.onEvent({ contract: "Circle", event: "ReserveChanged" }, async ({ event, context }) => {
  await updateCircle(context, event.srcAddress, () => ({
    reserveBalance: event.params.balance,
    exposure: event.params.exposure,
  }));
});

// ---- defaults & ejection ----------------------------------------------------------------------------

indexer.onEvent({ contract: "Circle", event: "DefaultMarked" }, async ({ event, context }) => {
  const now = ts(event.block.timestamp);
  const { member, round, fromDeposit, fromCollateral, fromReserve } = event.params;
  const circleId = event.srcAddress;
  const roundId = circleRoundId(circleId, round);
  const covered = fromDeposit + fromCollateral + fromReserve;
  const r = await context.Round.get(roundId);
  const seat = await updateMembership(context, membershipId(circleId, member), (s) => ({
    defaults: s.defaults + 1,
    deposit: s.deposit > fromDeposit ? s.deposit - fromDeposit : 0n,
    collateral: s.collateral > fromCollateral ? s.collateral - fromCollateral : 0n,
  }));
  context.Default.set({
    id: eventId(event),
    circle_id: circleId,
    round_id: roundId,
    member_id: member,
    fromDeposit,
    fromCollateral,
    fromReserve,
    ejected: false,
    timestamp: now,
    txHash: event.transaction.hash,
  });
  // The missed contribution was covered, so the round's pot is still whole: record it as a covered payment.
  context.Payment.set({
    id: `${eventId(event)}-covered`,
    circle_id: circleId,
    round_id: roundId,
    member_id: member,
    kind: "Covered",
    amount: covered,
    creditUsed: 0n,
    onTime: false,
    fromDeposit,
    fromCollateral,
    fromReserve,
    settlement: r?.settlement ?? false,
    currency: seat?.displayCurrency ?? "USD",
    timestamp: now,
    txHash: event.transaction.hash,
  });
  if (r) context.Round.set({ ...r, collected: r.collected + covered, paidCount: r.paidCount + 1 });
  await updateCircle(context, circleId, (c) => ({ defaults: c.defaults + 1 }));
  await updateGlobal(context, now, (g) => ({ defaults: g.defaults + 1 }));
});

indexer.onEvent({ contract: "Circle", event: "MemberEjected" }, async ({ event, context }) => {
  const now = ts(event.block.timestamp);
  const { member, round, refundDue } = event.params;
  const circleId = event.srcAddress;
  await updateMembership(context, membershipId(circleId, member), (s) => ({
    status: "Ejected",
    defaults: s.defaults + 1,
    refundDue,
    deposit: 0n,
    collateral: 0n,
    credit: 0n,
  }));
  context.Default.set({
    id: eventId(event),
    circle_id: circleId,
    round_id: circleRoundId(circleId, round),
    member_id: member,
    fromDeposit: 0n,
    fromCollateral: 0n,
    fromReserve: 0n,
    ejected: true,
    timestamp: now,
    txHash: event.transaction.hash,
  });
  // From this round on, pots are (active members x C) and the circle runs one fewer round.
  const r = await context.Round.get(circleRoundId(circleId, round));
  const circle = await updateCircle(context, circleId, (c) => ({
    defaults: c.defaults + 1,
    ejections: c.ejections + 1,
    activeCount: c.activeCount - 1,
    totalRounds: c.totalRounds - 1,
  }));
  if (r && circle && !r.settlement) {
    const newTarget = BigInt(circle.activeCount) * circle.contribution;
    context.Round.set({ ...r, potTarget: newTarget } satisfies Round);
    await updateCircle(context, circleId, (c) => ({ expected: c.expected - (r.potTarget - newTarget) }));
  }
  await updateMember(context, member, now, (m) => ({ circlesActive: Math.max(0, m.circlesActive - 1) }));
  await updateGlobal(context, now, (g) => ({ defaults: g.defaults + 1, ejections: g.ejections + 1 }));
});

indexer.onEvent({ contract: "Circle", event: "RepaymentOwed" }, async ({ event, context }) => {
  await updateMembership(context, membershipId(event.srcAddress, event.params.winner), (s) => ({
    repayOwed: s.repayOwed + event.params.amount,
  }));
});

indexer.onEvent({ contract: "Circle", event: "RepaymentPaid" }, async ({ event, context }) => {
  await updateMembership(context, membershipId(event.srcAddress, event.params.winner), (s) => ({
    repayOwed: s.repayOwed > event.params.amount ? s.repayOwed - event.params.amount : 0n,
  }));
});

indexer.onEvent({ contract: "Circle", event: "RoundCancelled" }, async ({ event, context }) => {
  const r = await context.Round.get(circleRoundId(event.srcAddress, event.params.round));
  if (r) context.Round.set({ ...r, status: "Cancelled", settlement: true, winner_id: undefined });
  await updateCircle(context, event.srcAddress, () => ({ inSettlement: true }));
});

indexer.onEvent({ contract: "Circle", event: "Claimed" }, async ({ event, context }) => {
  await updateMembership(context, membershipId(event.srcAddress, event.params.member), (s) => ({
    claimed: s.claimed + event.params.amount,
  }));
});

// Failed first collection attempts are visible as late payments once paid; nothing to store here.
indexer.onEvent({ contract: "Circle", event: "ContributionFailed" }, async () => {});
