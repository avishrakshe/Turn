# Turn — Economics

How money moves in a Turn circle, with worked examples. Every number below is reproduced by a test in
`contracts/test` (file and test name in brackets).

Notation: **N** members, contribution **C** per round, round **r** (1..N), discount **d** (the winning bid, in %),
**reserveBps** (share of each discount paid into the protection reserve, default 20%).

## 1. The promise

1. Every round, the recipient gets the **full pot**: (active members × C) minus only the discount *they chose to bid*.
2. Nobody receives less because someone else paid late or stopped paying.
3. The single documented exception is **ejection** (§6). From the ejection round on, pots are (N−1) × C, and those
   recipients also make one fewer contribution, so they don't lose anything.

The contracts check this continuously with four invariants:

| Invariant | Meaning |
| --- | --- |
| **I0** | The circle's AUSD balance equals exactly what it owes: deposits + collateral + credits + withdrawable + current pot + reserve + refund pool |
| **I1** | Uncovered exposure (collateral waived by trust + deposits rebated by trust) ≤ protection reserve |
| **I2** | At the end, no non-ejected member is worse off than the discount they themselves bid. An ejected member loses at most 10% of what they funded |
| **I3** | Every regular pot = active members × C |

These are enforced by `test/invariant/CircleInvariant.t.sol` (random actions, 128 × 64 calls) and
`test/invariant/CircleLifecycle.fuzz.t.sol` (512 full random circles, plus a test proving that ejections,
reserve-covered defaults, rebates, cancelled rounds and trust waivers are all reached).

## 2. Joining: the entry deposit

Each member deposits `entryDeposit` (default 1 × C, never less than C) when joining. It covers **one missed
payment before the member has received the pot**. When the member wins, the deposit is counted toward their collateral.

## 3. Winning the pot: collateral from the payout

After winning in round r, a member still owes `(N − r) × C`. That amount is held back from the payout as collateral, minus:

- their entry deposit, which counts toward it;
- any extra collateral they posted;
- a **trust waiver** (§5), if the reserve can back it.

The collateral is then released pro-rata with each on-time contribution: after each payment, collateral × (debt left ÷ debt before).

### Collateral per slot (N = 5, C = 100 AUSD, no discount, new member, no trust)

| Wins in round | Still owes | Collateral held | Paid out at win | Released later (on time) |
| --- | --- | --- | --- | --- |
| 1 | 400 | 400 | 200 (500 pot + 100 deposit − 400) | 100 per round × 4 |
| 2 | 300 | 300 | 300 | 100 per round × 3 |
| 3 | 200 | 200 | 400 | 100 per round × 2 |
| 4 | 100 | 100 | 500 | 100 × 1 |
| 5 | 0 | 0 | 600 (pot + deposit back) | — |

For a brand-new user, an early slot is mostly a savings commitment rather than a loan: the circle can't yet trust
them with money they haven't paid in. Early liquidity is earned through **trust** (§5) or by **posting collateral**.
[`Circle.t.sol: test_PostCollateralBeforeWinningReducesWithholding` — posting 300 lets a round-1 winner receive the full 500.]

## 4. The auction

In AUCTION mode, members who haven't received the pot bid a discount (0..maxDiscountBps) during the bid window.
The highest discount wins; ties go to the earlier bid. With no bids, the member with the best credit score wins
(ties by join order). In the last round, the remaining member gets the full pot.

The discount is split two ways:

- **reserveBps** (default 20%) goes into the circle's **protection reserve**;
- the rest is shared **equally as credit** among all other active members. Credit is used first to pay each
  member's next contribution; anything left is paid out at the end.

A bid is rejected if the discounted payout couldn't cover the collateral the winner will owe
(`pot × (1 − d) + deposit + posted collateral ≥ (N − r) × C`).

### Worked example (N = 5, C = 100, round 1, winning bid 20%) [`Scenarios.t.sol: test_Scenario1_HappyPathAuction`]

| Item | AUSD |
| --- | --- |
| Pot | 500 |
| Discount (20%) | 100 |
| → protection reserve (20% of discount) | 20 |
| → credit to each of the 4 other members | 20 each |
| Winner's collateral (owes 400, deposit 100 counts) | 400 |
| **Winner receives now** | 400 + 100 − 400 = **100** |
| Other members' next contribution | 100 − 20 credit = **80** |

The 20% discount is what the winner pays to access the pot early. The other members earn it as yield on their
savings. There is no organizer commission.

## 5. Trust and the protection reserve

`TrustMath.trustBps(record)` turns a wallet's CreditRegistry history into a share of collateral that may be waived:

```
trustBps = min(80%, completedCircles × 20%) × onTimeRate²  −  defaults × 25%     (floored at 0)
```

New users have 0. After one clean circle it's 20%, after four clean circles 80% (the cap).
[`TrustMath.t.sol`]

Trust is **bounded by the circle's protection reserve**:

- **Waiver at payout:** `waiver = min(debt × trustBps, reserve − current exposure)`.
- **Deposit rebate:** a trusted non-winner deposits the full amount, but part of it (up to `entryDeposit × trustBps`)
  is refunded once the reserve can back it.
- Both draw on **one budget**: `Σ waived collateral + Σ rebated deposits ≤ reserve` (**I1**).

A new circle's reserve starts at 0, so trust has an effect only after auction discounts (or ejection penalties) have funded the reserve.

### Worked example [`Scenarios.t.sol: test_Scenario5_TrustedMemberReducedCollateral`]

N = 5, C = 100. Member m3 has four clean circles (trust 80%).

| Step | Reserve | Exposure | Effect |
| --- | --- | --- | --- |
| Round 1: m0 wins at 30% (discount 150 → 30 to the reserve) | 30 | 0 → 30 | m3's deposit is rebated by 30 (wanted 80; the reserve allows 30) |
| Round 2: m3 wins at 30%. Owes 300; wants 80% waived = 240 | 30 → 60 | 30 | Waiver = 30 (all the reserve allows). **Collateral 270 instead of 300** |
| Round 3: untrusted m1 wins | 60 | 30 | Collateral = full 200 still owed |

### What if a trusted winner stops paying? [`test_Scenario5b_TrustedWinnerDefaultCoveredByReserve`]

m3 (collateral 270, owes 300) pays nothing in rounds 3–5:

| Round | Covered from collateral | Covered from reserve | Pot paid to that round's recipient |
| --- | --- | --- | --- |
| 3 | 100 | 0 | 500 |
| 4 | 100 | 0 | 500 |
| 5 | 70 | 30 | 500 |

The reserve pays exactly the waived 30. Every other member receives the full pot. m3's record shows three
defaults, which takes their trust to 0 in future circles.

### End of the circle
Whatever is left in the reserve is split equally among members with **no defaults in this circle**
(everyone, if all defaulted).

## 6. Missed payments

A payment is **late** if the first collection attempt fails, and the member can still pay any time before the
grace period ends. After `gracePeriod`, anyone (Chainlink CRE, our keeper, a member) can call `markDefault`:

| Who missed | Covered by | Consequence |
| --- | --- | --- |
| Member who already received the pot | Their collateral, then the reserve (never more than the waived part) | Default recorded; the pot stays full [`test_Scenario2_WinnerDefaultsRound3`] |
| Member who hasn't received it, 1st miss | Their entry deposit (any rebated part from the reserve) | Default recorded; the pot stays full |
| Member who hasn't received it, 2nd miss | — | **Ejected** (below) |

### Ejection

Take a member E who funded k rounds, counting the round their deposit paid for:

- **The ejection round is the first post-ejection round.** From it on, pots are (N−1) × C and the circle runs
  N−1 rounds. This is the only case where a recipient gets less than N × C, and they also make one fewer
  contribution.
- Each winner of E's k funded rounds received C of E's money, so they **owe C back**. It's collected in a
  settlement slot at the time round N would have run. Each of them still makes exactly N payments of at most C,
  so their existing auto-pay grant covers it and their collateral already backs it.
- E gets **k × C × 0.9** back at the end. The **10% penalty** goes into the reserve, which is shared among the
  remaining members. E also gets back any discount credit and any collateral they posted.

#### Worked example (N = 5, C = 100, no discounts; E misses rounds 2 and 3) [`test_Scenario3_NonWinnerEjected`]

| Member | Paid in | Received | Net |
| --- | --- | --- | --- |
| W1 (won round 1, pot 500) | 4 × 100 + 100 repayment = 500 | 500 | 0 + 5 reserve share = **+5** |
| W2 (won round 2, pot 500 incl. E's deposit) | 4 × 100 + 100 repayment = 500 | 500 | **+5** |
| W3 (won round 3, the ejection round: pot 4 × 100) | 400 | 400 | **+5** |
| W4 (won round 4, pot 4 × 100) | 400 | 400 | **+5** |
| E (ejected, k = 2) | 100 + 100 deposit | 180 | **−20** |

Edge case: if E was the last member still to receive, the ejection round has no recipient. It becomes the
settlement slot, and what the others paid that round goes straight to their repayments
[`test_Edge_EjectLastRecipientCancelsRound`]. If E had won the (already closed) auction for the ejection round,
the next-best bid takes it [`test_Edge_EjectedAuctionWinnerIsReplaced`].

## 7. Credit history

Every payment, default, and completed circle is written to the non-transferable `CreditRegistry`:

```
score (0–1000) = min(500, completed × 100)
               + onTimeRate × 400 × min(payments, 12) / 12
               + min(100, on-time payments)
               − defaults × 150
```

The on-time part ramps up over the first 12 payments, so a single payment isn't a "history". The score decides
who wins when nobody bids, and it feeds trust for future circles. The tunable constants are all in `TrustMath.sol`.

## 8. Mainnet beta guardrails

- `maxContribution` 25 AUSD and `maxMembers` 10. Both are owner-configurable; the hard ceiling is 20 members.
- The factory `pause()` blocks only **new circles and new joins**. Collecting, payouts, defaults and claims can
  never be paused [`CircleFactory.t.sol: test_PauseNeverBlocksRunningCircles`].
