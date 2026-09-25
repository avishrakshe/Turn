import { describe, it } from "vitest";
import { createTestIndexer } from "envio";
import { getAddress } from "viem";

// Simulated events for one Turn circle: 3 members in 3 countries, an auction round, auto-pay sessions,
// a default covered by the deposit and an ejection. Checks the entities the app reads.
// Addresses are checksummed, as Envio delivers them from real chains (address_format: checksum).
const FACTORY = getAddress("0x0000000000000000000000000000000000000001");
const REGISTRY = getAddress("0x0000000000000000000000000000000000000002");
const CIRCLE = getAddress("0x00000000000000000000000000000000000c1c1e");
const PRIYA = getAddress("0x000000000000000000000000000000000000a001"); // INR, in India
const RAVI = getAddress("0x000000000000000000000000000000000000a002"); // AED, in Dubai
const MEERA = getAddress("0x000000000000000000000000000000000000a003"); // GBP, in London
const C = 100_000_000n;
const INR = "0x494e52";
const AED = "0x414544";
const GBP = "0x474250";
const T0 = 1_800_000_000;
const tx = (n: number) => ({ hash: `0x${n.toString(16).padStart(64, "0")}` });

const params = {
  n: 3n,
  contribution: C,
  period: 300n,
  mode: 1n,
  maxDiscountBps: 3_000n,
  bidWindow: 120n,
  gracePeriod: 60n,
  entryDeposit: C,
  reserveBps: 2_000n,
};

describe("Turn indexer", () => {
  it("indexes a circle's lifecycle, live auction, sessions, credit and corridors", async (t) => {
    const indexer = createTestIndexer();
    let block = 100;
    const at = (secs: number) => ({ number: block++, timestamp: T0 + secs });

    // Registrations take effect between process() calls in the test harness (in production, same-block
    // events of a newly registered contract are indexed too), so the simulation runs in three phases.
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            {
              contract: "CircleFactory",
              event: "CircleCreated",
              srcAddress: FACTORY,
              block: at(0),
              transaction: tx(1),
              params: { circle: CIRCLE, creator: PRIYA, params, inviteHash: "0x" + "ab".repeat(32) },
            },
          ],
        },
      },
    });
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            { contract: "Circle", event: "Joined", srcAddress: CIRCLE, block: at(0), params: { member: PRIYA, deposit: C, displayCurrency: INR } },
            { contract: "Circle", event: "Joined", srcAddress: CIRCLE, block: at(10), params: { member: RAVI, deposit: C, displayCurrency: AED } },
            { contract: "Circle", event: "Joined", srcAddress: CIRCLE, block: at(20), params: { member: MEERA, deposit: C, displayCurrency: GBP } },
          ],
        },
      },
    });
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            { contract: "TurnAccount", event: "PullGranted", srcAddress: PRIYA, block: at(20), params: { circle: CIRCLE, maxAmount: C, period: 300n, validUntil: BigInt(T0 + 86_400) } },
            { contract: "TurnAccount", event: "PullGranted", srcAddress: RAVI, block: at(20), params: { circle: CIRCLE, maxAmount: C, period: 300n, validUntil: BigInt(T0 + 86_400) } },
            { contract: "Circle", event: "CircleStarted", srcAddress: CIRCLE, block: at(20), params: { startTime: BigInt(T0 + 20), members: [PRIYA, RAVI, MEERA] } },
            { contract: "Circle", event: "RoundOpened", srcAddress: CIRCLE, block: at(20), params: { round: 1n, start: BigInt(T0 + 20), settlement: false, potTarget: 3n * C } },
            { contract: "CreditRegistry", event: "RecordUpdated", srcAddress: REGISTRY, block: at(20), params: { account: RAVI, record: { circlesJoined: 3n, circlesCompleted: 2n, paymentsOnTime: 10n, paymentsLate: 0n, defaults: 1n, totalContributed: 1_000n * C } } },
            // Round 1: auto-pay collection, then a live auction.
            { contract: "Circle", event: "ContributionPaid", srcAddress: CIRCLE, block: at(21), transaction: tx(2), params: { member: PRIYA, round: 1n, amount: C, creditUsed: 0n, onTime: true } },
            { contract: "TurnAccount", event: "Pulled", srcAddress: PRIYA, block: at(21), params: { circle: CIRCLE, round: 1n, amount: C } },
            { contract: "Circle", event: "ContributionPaid", srcAddress: CIRCLE, block: at(21), transaction: tx(2), params: { member: RAVI, round: 1n, amount: C, creditUsed: 0n, onTime: true } },
            { contract: "Circle", event: "ContributionPaid", srcAddress: CIRCLE, block: at(21), transaction: tx(2), params: { member: MEERA, round: 1n, amount: C, creditUsed: 0n, onTime: true } },
            { contract: "Circle", event: "BidPlaced", srcAddress: CIRCLE, block: at(30), transaction: tx(3), params: { member: RAVI, round: 1n, discountBps: 500n } },
            { contract: "Circle", event: "BidPlaced", srcAddress: CIRCLE, block: at(40), transaction: tx(4), params: { member: PRIYA, round: 1n, discountBps: 1_000n } },
            { contract: "Circle", event: "BidPlaced", srcAddress: CIRCLE, block: at(50), transaction: tx(5), params: { member: MEERA, round: 1n, discountBps: 1_000n } },
            { contract: "Circle", event: "AuctionClosed", srcAddress: CIRCLE, block: at(140), params: { round: 1n, winner: PRIYA, discountBps: 1_000n, noBids: false } },
            { contract: "Circle", event: "PayoutMade", srcAddress: CIRCLE, block: at(141), transaction: tx(6), params: { winner: PRIYA, round: 1n, pot: 3n * C, discount: 30_000_000n, toReserve: 6_000_000n, collateralRequired: 2n * C, trustWaiver: 0n, netPaid: 170_000_000n } },
            { contract: "Circle", event: "CreditAccrued", srcAddress: CIRCLE, block: at(141), params: { member: RAVI, round: 1n, amount: 12_000_000n } },
            { contract: "Circle", event: "ReserveChanged", srcAddress: CIRCLE, block: at(141), params: { balance: 6_000_000n, exposure: 0n } },
            { contract: "Circle", event: "RoundOpened", srcAddress: CIRCLE, block: at(320), params: { round: 2n, start: BigInt(T0 + 320), settlement: false, potTarget: 3n * C } },
            // Round 2: Meera misses; her deposit covers it. Round 3: she misses again and is ejected.
            { contract: "Circle", event: "ContributionPaid", srcAddress: CIRCLE, block: at(321), transaction: tx(7), params: { member: PRIYA, round: 2n, amount: C, creditUsed: 0n, onTime: true } },
            { contract: "Circle", event: "ContributionPaid", srcAddress: CIRCLE, block: at(321), transaction: tx(7), params: { member: RAVI, round: 2n, amount: C, creditUsed: 12_000_000n, onTime: true } },
            { contract: "Circle", event: "DefaultMarked", srcAddress: CIRCLE, block: at(381), transaction: tx(8), params: { member: MEERA, round: 2n, fromDeposit: C, fromCollateral: 0n, fromReserve: 0n } },
            { contract: "Circle", event: "RoundOpened", srcAddress: CIRCLE, block: at(620), params: { round: 3n, start: BigInt(T0 + 620), settlement: false, potTarget: 3n * C } },
            { contract: "Circle", event: "MemberEjected", srcAddress: CIRCLE, block: at(681), transaction: tx(9), params: { member: MEERA, round: 3n, fundedRounds: 2n, refundDue: 180_000_000n } },
            { contract: "TurnAccount", event: "PullRevoked", srcAddress: RAVI, block: at(700), params: { circle: CIRCLE } },
          ],
        },
      },
    });

    const circle = await indexer.Circle.getOrThrow(CIRCLE);
    t.expect(circle).toMatchObject({
      status: "Active",
      mode: "Auction",
      size: 3,
      memberCount: 3,
      activeCount: 2,
      totalRounds: 2,
      currentRound: 3,
      currencies: ["INR", "AED", "GBP"],
      onTimePayments: 5,
      defaults: 2,
      ejections: 1,
      reserveBalance: 6_000_000n,
      totalPaidOut: 270_000_000n,
      totalDiscount: 30_000_000n,
      collected: 5n * C,
      // 3 + 3 + (3 -> 2 after the ejection) contributions expected
      expected: 8n * C,
    });
    t.expect(circle.healthScore).toBe(56); // 5 on-time of 7 due -> 71, minus 15 for one ejection

    // Live auction: highest discount leads; an equal later bid doesn't take the lead.
    const r1 = await indexer.Round.getOrThrow(`${CIRCLE}-1`);
    t.expect(r1).toMatchObject({
      status: "PaidOut",
      bidCount: 3,
      bestBidBps: 1_000,
      bestBidder_id: PRIYA,
      winner_id: PRIYA,
      discountBps: 1_000,
      netPaid: 170_000_000n,
      paidCount: 3,
      collected: 3n * C,
    });
    // Ejection round: pot target is (active members x C).
    t.expect((await indexer.Round.getOrThrow(`${CIRCLE}-3`)).potTarget).toBe(2n * C);
    // Round 2 still full: the deposit-covered miss is a "Covered" payment.
    const r2 = await indexer.Round.getOrThrow(`${CIRCLE}-2`);
    t.expect(r2.collected).toBe(3n * C);

    const priya = await indexer.Membership.getOrThrow(`${CIRCLE}-${PRIYA}`);
    t.expect(priya).toMatchObject({ hasWon: true, wonRound: 1, received: 270_000_000n, collateral: 2n * C, displayCurrency: "INR" });
    const meera = await indexer.Membership.getOrThrow(`${CIRCLE}-${MEERA}`);
    t.expect(meera).toMatchObject({ status: "Ejected", refundDue: 180_000_000n, defaults: 2 });
    const ravi = await indexer.Membership.getOrThrow(`${CIRCLE}-${RAVI}`);
    t.expect(ravi.credit).toBe(0n); // accrued 12, spent 12

    // Cross-circle credit (exact onchain formulas).
    t.expect(await indexer.Member.getOrThrow(RAVI)).toMatchObject({
      creditScore: 393, // 2 circles (200) + on-time 400 x 9090/10000 x 11/12 (333) + 10 on-time - 1 default (150)
      trustBps: 805,
      trustLevel: "Building",
      displayCurrency: "AED",
    });

    // Corridors: AED->INR and GBP->INR are cross-border; INR->INR is domestic.
    const corridors = await indexer.CorridorStats.getAll();
    const byId = Object.fromEntries(corridors.map((c) => [c.id, c]));
    t.expect(byId["AED-INR"]).toMatchObject({ volume: C, crossBorder: true, transfers: 1, circles: 1 });
    t.expect(byId["GBP-INR"]).toMatchObject({ volume: C, crossBorder: true });
    t.expect(byId["INR-INR"]).toMatchObject({ volume: C, crossBorder: false });

    // Auto-pay sessions.
    t.expect(await indexer.Session.getOrThrow(`${PRIYA}-${CIRCLE}`)).toMatchObject({ active: true, pulls: 1, totalPulled: C });
    t.expect(await indexer.Session.getOrThrow(`${RAVI}-${CIRCLE}`)).toMatchObject({ active: false });

    const defaults = await indexer.Default.getAll();
    t.expect(defaults.map((d) => d.ejected).sort()).toEqual([false, true]);

    t.expect(await indexer.GlobalStats.getOrThrow("global")).toMatchObject({
      circlesCreated: 1,
      circlesActive: 1,
      members: 3,
      totalSaved: 5n * C,
      totalPaidOut: 270_000_000n,
      paymentsOnTime: 5,
      defaults: 2,
      ejections: 1,
      crossBorderVolume: 2n * C,
      activeSessions: 1,
      onTimeRateBps: 7_142,
    });
  });
});
