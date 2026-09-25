# Turn — Phase 1 Plan (final)

Written 2026-09-26. This version includes the answers to the Phase 1 questions. Items still pending
are listed in §9.

## 1. Understanding

Turn is an onchain ROSCA ("committee" / chit fund) on Monad. It is built for Indian families and
Gulf-based migrant workers who already run monthly committees across the UAE→India corridor.
- N members (3–20, capped at 10 on mainnet beta) each contribute C AUSD per period.
- Each round one member receives the pot: either in a fixed order, or by a discount auction where
  the discount becomes credit for the other members.
- Defaults are covered first by an entry deposit (before winning) or by collateral withheld from
  the payout (after winning), then by a per-circle **protection reserve**.
- Trusted members lock less collateral, but only as much as the reserve can back.
- The user sees Face ID, their own currency, and plain language. They never see gas, addresses,
  chains or signatures.
- mera (passkey EOA) + EIP-7702 (TurnAccount delegate) + our relayer make everything gasless.
- Envio is the source of truth for history. Chainlink CRE runs the rounds and sends FX-priced
  Telegram notifications.

## 2. Verified facts

| Fact | Value | Source |
| --- | --- | --- |
| Monad mainnet chain ID | `143` (confirmed via `eth_chainId` = `0x8f`) | docs.monad.xyz/developer-essentials/network-information |
| Monad testnet chain ID | `10143` (confirmed via `eth_chainId` = `0x279f`) | docs.monad.xyz/developer-essentials/testnets |
| Testnet RPC / explorer / faucet | `https://testnet-rpc.monad.xyz`, `testnet.monadvision.com`, `testnet.monadscan.com`, `faucet.monad.xyz` | same |
| Testnet reset | Reset from genesis on 2025-12-16 | same |
| AUSD mainnet | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`, `decimals()` = **6**, symbol `AUSD` (read on-chain) | docs.agora.finance/developer/contract-deployments |
| AUSD testnet | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, `decimals()` = **6**, symbol `AUSD` (read on-chain) | same |
| Gas charging | Charged on **gas limit**: `value + gas_bid * gas_limit` | docs.monad.xyz/developer-essentials/differences |
| Mempool / history | No global mempool; full nodes don't serve arbitrary historic state | same |
| Contract size | 128 KB max code size | same |
| P256 precompile | `secp256r1` verify at `0x0100` | same |
| 7702 reserve balance | A delegated EOA's tx that would **reduce** its MON balance below 10 MON reverts. If the balance is unchanged or increased, the tx succeeds | docs.monad.xyz/developer-essentials/eip-7702 |
| 7702 CREATE | `CREATE`/`CREATE2` revert when code runs **in the delegated EOA's context** | same |
| 7702 sponsorship | Type `0x04`: the EOA signs an authorization tuple and a sponsor submits it. Delegation persists until changed | same |
| Foundry | **Standard Foundry** (`foundryup`, ≥ v1.8.0) with `network = "monad"` in `foundry.toml`. No fork needed | docs.monad.xyz/guides/deploy-smart-contract/foundry |
| mera package | `@category-labs/mera`: `getPasskeyPrfOutput`, `createSecp256k1SigningSession`; `toViemAccount` from `@category-labs/mera/viem` | mera.category.xyz |
| mera viem account | `LocalAccount<"mera">` with `signTransaction`, `signMessage`, `signTypedData` (EIP-712), `signAuthorization` (EIP-7702) | mera.category.xyz/recipes/send-a-transaction-with-viem |
| mera sessions | Key held **in memory** only; `end()` zeroes it; the next signature needs a new ceremony | mera.category.xyz/concepts/signing-sessions |
| mera accounts | PRF(credential, rpId, salt) → BIP-39 seed → HD derivation by index. Same passkey gives the same accounts on every device. Creation takes 1 prompt (2 on authenticators without PRF-at-create) | mera.category.xyz/recipes/create-passkey-accounts |
| Envio | HyperIndex/HyperSync support Monad mainnet (`https://monad.hypersync.xyz`) and testnet | envio.dev/chains/monad |
| CRE on Monad | Mainnet (CLI ≥ 1.29) and testnet (CLI ≥ 1.30, TS SDK ≥ 1.19) supported | docs.chain.link/cre/supported-networks-ts |
| CRE forwarders | Testnet: simulation `0xB9F79d863261869B234c481D1f9A7af84AeAd192`, production `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`. Mainnet: simulation `0x9eF6468C5f37b976E57d52054c693269479A784d`, production `0x76c9cf548b4179F8901cda1f8623568b58215E62`. Writes go forwarder → consumer `onReport` | docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts |
| Mercuryo sandbox | Credentials + IP whitelisting from their integration manager | widget.docs.mercuryo.io/guide/getting-started/sandbox |

**Still unverified (checked in the phase that needs it):**
- Block time (300 ms vs 400 ms). It doesn't matter here, because all timing uses `block.timestamp` seconds.
- Whether mera fresh-device sign-in works without a stored `credentialId` (Phase 5).
- mera mnemonic export. There's no dedicated API; we derive the mnemonic with `entropyToMnemonic` behind a fresh ceremony.
- Whether a CRE production deploy needs early access (Phase 4).
- Whether Mercuryo supports AUSD on Monad (§9).

## 3. Decisions

### 3.1 Accounts, sessions, gas
1. **One account per user.** The app derives the primary mera account (HD index 0).
   - Derivation sits behind a `TurnKeyring` interface: `derive(purpose: "primary") → Account`.
   - Adding a "savings vault" key or a recovery key later is a new `purpose` → index mapping, not a rewrite.
   - No per-circle accounts, until we see the "One Passkey, Many Keys" criteria.
2. **Auto-pay is enforced by the contract.** mera sessions die on reload, so they can't approve
   monthly payments. Instead, the join batch includes a `grantPull` that TurnAccount enforces:
   - the caller must be a factory-registered Circle
   - `amount ≤ maxAmount (= C)`
   - one pull per round, at least `period − tolerance` apart
   - `block.timestamp ≤ validUntil (= circle end)`
   - the grant hasn't been revoked

   Each contribution then needs no prompt and no signer. Members who aren't delegated (e.g. a judge
   using MetaMask) fall back to an AUSD allowance and `transferFrom`.
3. **One Face ID for onboarding and the first join.** A single mera ceremony opens an in-memory
   session that signs the 7702 authorization **and** the EIP-712 batch
   (`approve` → `join` → `grantPull`). The relayer submits one type-4 tx.
4. **The 10 MON reserve-balance rule doesn't affect us.** Users hold 0 MON and TurnAccount rejects
   `value > 0`, so a delegated EOA's MON balance never drops. TurnAccount never uses CREATE, and
   clones are created in the factory's context. I'll confirm this with a live type-4 tx on testnet
   at the start of Phase 3.
5. **Relayer.**
   - Gas: `eth_estimateGas` + 10% buffer, a hard cap per call type, and a per-account daily cap
     (gas is billed on the limit).
   - Rate limiting per IP and per account.
   - Target allowlist, checked in both the relayer and TurnAccount: AUSD, the factory,
     factory-registered Circles, and self.
   - Trust model: it can censor but can't steal, because every call carries the user's EIP-712
     signature (nonce, deadline, chainId).
6. **CRE writes through `TurnKeeper`.** It implements `IReceiver.onReport`, accepts only the
   configured forwarder, decodes `(circle, action, args)` and calls the permissionless round
   function. The fallback Node keeper calls the same functions directly. Both use one shared
   TS `decide()` module.

### 3.2 Round timeline
Each round runs from `roundStart`:
1. `collect` is open from `roundStart` and can be retried until the round ends.
2. Bids are accepted during `[roundStart, roundStart + bidWindow)`.
3. `closeAuction` runs after the bid window.
4. `payout` runs once every active member is **paid** or **covered**. Covered means
   `markDefault` has run after `gracePeriod` and the shortfall was filled from
   deposit → collateral → reserve.

So a late payer delays the payout by at most `gracePeriod` and never shrinks the pot.

Demo settings: `period = 300 s`, `bidWindow = 120 s`, `gracePeriod = 60 s`.

### 3.3 Protection reserve and trust (from your answer 3)

State per circle:
- `R`: reserve balance
- per winner `i`:
  - `D_i`: outstanding debt, i.e. remaining contributions + ejection repayments, in AUSD
  - `K_i`: collateral held
  - exposure `X_i = D_i − K_i` (≥ 0)

Rules:
- **Funding.** Each auction payout moves `reserveBps` (default 2000 = 20%) of the discount into
  `R`. The remaining 80% is split equally as credit to the other active members. Ejection
  penalties go to `R`.
- **Granting trust at payout.**
  - `fullReq = D_i` (remaining debt at the moment of winning)
  - `desiredWaiver = fullReq × trustBps / 10 000`
  - `grantedWaiver = min(desiredWaiver, R − ΣX − ΣY)`
  - `K_i = fullReq − grantedWaiver − entryDeposit_i − externalCollateral_i`, floored at 0.
    The entry deposit and any posted collateral count toward this.
  - `K_i` is withheld from the payout.
- **Invariant I1: `ΣX_i + ΣY_j ≤ R` at all times.** `X` is waived collateral and `Y` is rebated
  deposit, and both draw on one budget. Every "available" check below uses `R − ΣX − ΣY`.
- **Releases.** After each on-time contribution, `D_i −= C` and `K_i` shrinks proportionally:
  `K_i ← K_i·(D_i − C)/D_i`, with the released amount paid to the member. Both `K_i` and `X_i`
  shrink, so I1 still holds.
- **A default by winner i.** Cover `c = min(K_i, C)` from collateral and `y = C − c` from the
  reserve, then `D_i −= C`.
  - `X_i` falls by exactly `y`, and `R` falls by exactly `y`, so I1 still holds.
  - Because `y ≤ X_i ≤ R`, the reserve can always pay.
  - Other members never receive less than promised.
- **Perks.**
  - *Tie-break when nobody bids:* highest `CreditRegistry.score`, then join order.
  - *Reduced entry deposit (**deposit rebate**, approved):* the reserve is 0 while a circle forms,
    so a trusted member deposits the full amount.
    - Later, whenever `R − ΣX` allows, up to `entryDeposit × trustBps` is refunded.
    - The refunded amount `Y_j` counts toward the **same** uncovered-exposure budget as waived collateral.
    - If that member misses a payment before winning, the remaining deposit is used first, then the reserve covers the rebated part.
- **Completion.** Leftover `R` is split equally among members with 0 defaults in this circle.
  Ejected members are excluded.
- **Honest limitation.** FIXED_ORDER circles have no auction discounts, so the reserve only grows
  from penalties, and trust rarely waives collateral there. Trust still gives the tie-break perk.
  This will be documented in economics.md.

### 3.4 Ejection (from your answer 4)
A non-winner's first miss is covered by their entry deposit. On a second miss (`markDefault`
after grace), they are ejected.
- **k** = the number of rounds the ejected member funded, **including the round funded by their
  consumed deposit** (approved). Otherwise that round's winner would keep a windfall of C.
  - Each winner of those k rounds gets `+C` added to `D_i`.
  - The circle now runs **N−1** rounds, which removes one future contribution (`−C`). So each
    affected winner's total obligation, and therefore their collateral, stays the same.
- **When the repayment is collected:** in a *settlement slot* at the time where round N would have run.
  Each affected winner therefore still makes exactly N pulls, each ≤ C, so the existing pull grant
  (`validUntil` = original end) covers it with no new prompt. A missed settlement pull is handled
  like any winner default: collateral first, then the reserve.
- The ejected member receives `0.9·k·C` at final settlement. `0.1·k·C` goes to `R` and is split
  among the remaining members at completion.
- **The ejection round is the first post-ejection round.** The round of the *second* miss (the one
  that triggers ejection) already uses pot `(N−1)·C`, and so does every later round. The circle
  runs N−1 rounds in total.
- **This is the only case where a winner receives less than a full `N·C` pot.** Those winners
  also make one fewer contribution, so their net is unchanged. In code, `potFor(round)` returns
  `activeMembers(round)·C`, and the reduced pot is emitted in `PayoutMade.pot`.
- Worked example (N=5, C=100 AUSD, no discounts; E misses rounds 2 and 3, so round 3 is the
  first post-ejection round):

| Member | Paid in | Received | Net before reserve split |
| --- | --- | --- | --- |
| W1 (won r1) | 4×100 + 100 repay = 500 | 500 | 0 |
| W2 (won r2, funded partly by E's deposit) | 4×100 + 100 repay = 500 | 500 | 0 |
| W3 (won r3, the ejection round: pot 4×100) | 400 | 400 | 0 |
| W4 (won r4: pot 4×100) | 400 | 400 | 0 |
| E (ejected, k = 2) | 100 + 100 deposit | 180 | −20 (penalty → reserve → +5 each to W1–W4) |

- **Invariant I2:** every non-ejected member finishes with net ≥ 0.

### 3.5 Tokens, networks, mainnet safety (from your answer 5)
- The contracts take the token as an `IERC20` constructor/factory parameter. There's no hard-coded
  address.
- **Dev/CI and testnet:** `MockAUSD`, named "Mock AUSD (TEST ONLY)", symbol `mAUSD`, 6 decimals.
  It has a capped public `faucet()` and is deployed only on testnet/local. Deploy scripts pick the
  token by chain ID. If Agora provides testnet AUSD, switch to `0xa901…22dC`.
- **Real user test + demo:** Monad mainnet with real AUSD `0x0000…9012a` and small amounts.
- **Mainnet guardrails in the factory (owner-configurable):**
  - `maxContribution` (default 25 AUSD) and `maxMembers` (default 10).
  - `Pausable`: pausing blocks `createCircle` and new `join`s only.
    `collect`/`payout`/`markDefault`/`claim` and all withdrawals are **never** pausable.
  - A visible "Beta" label in the UI.
- The factory owner is the deployer key. Moving it to a multisig is noted as future work.

### 3.6 Cross-border / Agora (criteria pending)
AUSD is the only settlement asset. Each member picks a display currency, which is emitted
on-chain (`MemberProfileSet`) so it survives the stateless test. Envio aggregates
`CorridorStats` by currency pair. Receipts show "You paid AED 367 ≈ 100 AUSD, settled
instantly". The corridor and FX layer sit behind one module (`fx.ts` + indexer entities), so it
can adapt to Agora's criteria when they arrive.

### 3.7 Mercuryo (from your answer 6)
"Add money" is off the critical path. The widget runs behind a `RampProvider` adapter
(`mercuryo` | `faucet`). If Mercuryo doesn't support AUSD on Monad, we on-ramp to a Monad
stablecoin they do support, show a clear note, and list the swap as future work. No swap will be
built unless it turns out to be trivial.

## 4. File tree

```
Turn/
├── package.json, pnpm-workspace.yaml, .env.example, README.md, LICENSE
├── contracts/                          @turn/contracts
│   ├── foundry.toml                    (network = "monad"; profiles: default, ci, coverage)
│   ├── src/
│   │   ├── CircleFactory.sol           clones, registry auth, caps, Pausable
│   │   ├── Circle.sol                  rounds, auction, collateral, reserve, defaults, ejection
│   │   ├── CreditRegistry.sol          non-transferable records + score()
│   │   ├── TurnAccount.sol             EIP-7702 delegate, EIP-712 batches, pull grants, ERC-7201
│   │   ├── TurnKeeper.sol              CRE IReceiver → permissionless round calls
│   │   ├── libraries/TrustMath.sol     trustBps(record), requiredCollateral(...)
│   │   ├── libraries/CircleTypes.sol
│   │   ├── interfaces/                 ICircle, ICircleFactory, ICreditRegistry, ITurnAccount, IReceiver
│   │   └── test-tokens/MockAUSD.sol    (testnet/local only)
│   ├── test/
│   │   ├── unit/                       one file per contract + TrustMath
│   │   ├── fuzz/                       bids, amounts, timings, trust inputs
│   │   ├── invariant/                  I0 balance, I1 exposure ≤ reserve, I2 net ≥ 0
│   │   └── scenario/                   the 7 required scenarios + ejection settlement + trusted default via reserve
│   └── script/                         Deploy.s.sol, SeedDiasporaCircle.s.sol
├── relayer/                            @turn/relayer   (Hono, Node 24, viem)
│   └── src/ server.ts, policy.ts, submit.ts, store.ts, feedback.ts
├── indexer/                            @turn/indexer   (Envio HyperIndex → Envio Cloud)
│   ├── config.yaml, schema.graphql
│   └── src/EventHandlers.ts
├── automation/                         @turn/automation
│   ├── shared/decide.ts                one decision function
│   ├── cre/                            workflow.ts, config.*.json, project.yaml, secrets.yaml (gitignored values)
│   └── keeper/                         fallback Node keeper
├── web/                                @turn/web  (Next.js App Router, Tailwind, wagmi/viem, mera, PWA)
│   ├── app/                            (landing), onboarding, home, create, join/[code], circle/[id],
│   │                                   add-money, credit/[address], settings, metrics, api/credit/[address]
│   ├── lib/                            keyring.ts (TurnKeyring), relayer.ts, envio.ts, fx.ts, ramp.ts, sessions.ts
│   └── e2e/                            stateless.spec.ts, onboarding.spec.ts
└── docs/                               plan.md, economics.md, submission.md, demo-video-script.md,
                                        pitch-video-script.md, ad-script.md, traction.md, ACCESS.md,
                                        architecture.md, logo.png
```

## 5. Contract interfaces

```solidity
// ---- CircleTypes ----
enum Mode { FIXED_ORDER, AUCTION }
enum Status { FORMING, ACTIVE, COMPLETED }
enum MemberState { NONE, ACTIVE, EJECTED }
struct Params {
  uint8   n;               // 3..maxMembers
  uint128 contribution;    // C, token units (6 dp); ≤ maxContribution
  uint32  period;          // seconds
  Mode    mode;
  uint16  maxDiscountBps;  // ≤ 5000
  uint32  bidWindow;       // < period
  uint32  gracePeriod;     // bidWindow + grace < period
  uint128 entryDeposit;    // default = C
  uint16  reserveBps;      // default 2000
}

// ---- CircleFactory ----
interface ICircleFactory {
  event CircleCreated(address indexed circle, address indexed creator, Params params, bytes32 inviteHash);
  event LimitsUpdated(uint128 maxContribution, uint8 maxMembers);
  function createCircle(Params calldata p, address[] calldata fixedOrder, bytes32 inviteHash) external returns (address);
  function isCircle(address) external view returns (bool);
  function token() external view returns (IERC20);
  function registry() external view returns (ICreditRegistry);
  function paused() external view returns (bool);
  function setLimits(uint128 maxContribution, uint8 maxMembers) external;  // onlyOwner
  function pause() external; function unpause() external;                  // onlyOwner (create/join only)
}

// ---- Circle (EIP-1167 clone) ----
interface ICircle {
  function join(bytes32 inviteSecret, bytes3 displayCurrency) external;    // pulls entryDeposit; starts circle at n
  function collect() external;                         // permissionless, idempotent; per-member try/catch
  function bid(uint16 discountBps) external;           // AUCTION, eligible, in window
  function closeAuction() external;                    // permissionless after window
  function payout() external;                          // permissionless once all paid/covered
  function markDefault(address member, uint256 round) external; // permissionless after grace
  function postCollateral(uint256 amount) external;
  function claim() external;                           // after completion: collateral, deposit, credit, refund, reserve share
  function setDisplayCurrency(bytes3 ccy) external;
  // views
  function params() external view returns (Params memory);
  function status() external view returns (Status);
  function currentRound() external view returns (uint256 round, uint64 start, bool paidOut);
  function memberInfo(address) external view returns (MemberView memory);
  function reserve() external view returns (uint256 balance, uint256 totalExposure);
  function claimable(address) external view returns (uint256);
  // events (indexer + UI)
  event Joined(address indexed member, uint256 deposit, bytes3 displayCurrency);
  event CircleStarted(uint64 startTime, address[] members);
  event ContributionPaid(address indexed member, uint256 indexed round, uint256 amount, uint256 creditUsed, bool onTime);
  event ContributionFailed(address indexed member, uint256 indexed round);
  event BidPlaced(address indexed member, uint256 indexed round, uint16 discountBps);
  event AuctionClosed(uint256 indexed round, address winner, uint16 discountBps, bool noBids);
  event PayoutMade(address indexed winner, uint256 indexed round, uint256 pot, uint256 discount, uint256 toReserve, uint256 collateralWithheld, uint256 trustWaiver, uint256 netPaid);
  event CreditAccrued(address indexed member, uint256 indexed round, uint256 amount);
  event CollateralReleased(address indexed member, uint256 amount);
  event DefaultMarked(address indexed member, uint256 indexed round, uint256 fromDeposit, uint256 fromCollateral, uint256 fromReserve);
  event MemberEjected(address indexed member, uint256 indexed round, uint256 k, uint256 refund, uint256 penalty);
  event RepaymentOwed(address indexed winner, uint256 amount);
  event ReserveChanged(uint256 balance, uint256 totalExposure);
  event CircleCompleted(uint256 reserveDistributed);
  event Claimed(address indexed member, uint256 amount);
  event MemberProfileSet(address indexed member, bytes3 displayCurrency);
}

// ---- CreditRegistry ----
interface ICreditRegistry {
  struct Record { uint32 circlesJoined; uint32 circlesCompleted; uint32 paymentsOnTime;
                  uint32 paymentsLate; uint32 defaults; uint128 totalContributed; }
  event RecordUpdated(address indexed account, Record record);
  function recordOf(address) external view returns (Record memory);
  function score(address) external view returns (uint16);   // 0..1000
  function onJoined(address) external;                       // onlyCircle
  function onPayment(address, uint256 amount, bool onTime) external;
  function onDefault(address) external;
  function onCompleted(address) external;
}

// ---- TrustMath (pure library, tunable constants) ----
library TrustMath {
  function trustBps(ICreditRegistry.Record memory r) internal pure returns (uint16); // 0 for new users, cap 8000
  function score(ICreditRegistry.Record memory r) internal pure returns (uint16);
}

// ---- TurnAccount (EIP-7702 delegate; ERC-7201 storage "turn.account.v1") ----
interface ITurnAccount {
  struct Call { address target; bytes data; }                 // value is always 0
  struct PullGrant { uint128 maxAmount; uint32 period; uint64 validUntil; uint64 lastPullAt; uint32 lastRound; bool active; }
  event Executed(uint256 indexed nonce, uint256 calls);
  event PullGranted(address indexed circle, uint128 maxAmount, uint32 period, uint64 validUntil);
  event PullRevoked(address indexed circle);
  event Pulled(address indexed circle, uint256 indexed round, uint256 amount);
  function execute(Call[] calldata calls, uint256 nonce, uint256 deadline, bytes calldata sig) external; // EIP-712, signer == address(this)
  function grantPull(address circle, uint128 maxAmount, uint32 period, uint64 validUntil) external;  // self only
  function revokePull(address circle) external;                                                     // self only
  function pullContribution(uint256 round, uint256 amount) external;                                // registered circle, in scope
  function nonce() external view returns (uint256);
  function grantOf(address circle) external view returns (PullGrant memory);
}

// ---- TurnKeeper (CRE consumer) ----
interface ITurnKeeper /* is IReceiver */ {
  enum Action { COLLECT, CLOSE_AUCTION, PAYOUT, MARK_DEFAULT }
  function onReport(bytes calldata metadata, bytes calldata report) external; // only forwarder; report = abi.encode(Job[])
}
```

Invariants tested in Phase 2:
- **I0:** `token.balanceOf(circle) == Σ unreleased collateral + Σ deposits + Σ credit balances + current-round pot + R + Σ pending refunds`
  (the reserve and refunds are added to the spec's formula).
- **I1:** `ΣX_i + ΣY_j ≤ R` (waived collateral + rebated deposits ≤ reserve).
- **I2:** every non-ejected member finishes with net ≥ 0.
- **I3:** every payout pot equals `activeMembers·C`. Before any ejection that is `N·C`; from the
  ejection round on it is `(N−1)·C`. Nothing else ever reduces a pot.

## 6. Session design

| Action | Prompt? | Enforced by |
| --- | --- | --- |
| Onboard + first join (7702 auth + batch) | 1 Face ID | mera ceremony; relayer type-4 tx |
| Each contribution (auto-pay) | **None** | TurnAccount `PullGrant` (circle, ≤ C, once per round, until circle end) |
| Bid ≤ 10% discount while the app is open | None (in-memory mera session) | EIP-712 signature, nonce + deadline |
| Bid > 10%; join another circle; claim/withdraw; change payout destination; renew or revoke auto-pay | Face ID | fresh mera ceremony |
| Export recovery phrase | Face ID | Settings only |
| Auto-pay expiry | Banner: "Auto-pay for *Family Circle* has ended. Turn it back on?" One tap → Face ID | `validUntil` |
| After reload / new device | The first action that needs a signature asks for Face ID; reading needs none | state from chain + Envio |

## 7. Assumptions (proceeding unless you object)
- A1: pnpm workspaces, Node 24 LTS.
- A2: The entry deposit and any posted collateral count toward a winner's `K_i`.
- A3: FIXED_ORDER uses the same pipeline without a bid window, and the winner is `order[r]`.
- A4: Credit offsets the next contribution first. Any remainder is claimable at completion.
- A5: The discount credit (80% after the reserve slice) goes to all other active members,
  including earlier winners.
- A6: The feedback prompt stores ratings off-chain in the relayer's store. This is disclosed and used only for traction.md.
- A7: Solidity 0.8.28, OpenZeppelin v5, `evm_version` left at the Foundry default unless Monad docs require otherwise.

## 8. Environment (answer 9)
- Monad docs recommend **standard Foundry** via `foundryup` (≥ v1.8.0) with `network = "monad"`. No fork needed.
- WSL currently only has the `docker-desktop` distro. **Ubuntu isn't installed yet.**

## 9. Still pending
1. Agora bounty criteria: expected before Phase 5. Designing for AUSD settlement in a cross-border flow, kept adaptable.
2. "One Passkey, Many Keys" criteria: expected before Phase 5. One account per user behind `TurnKeyring`.
3. Team names and roles: use `TEAM_TBD` in docs until the docs phase.

## 10. Phase 2 implementation notes (decisions made while building)

- **FIXED_ORDER = join order.** Passkey accounts only exist once a member onboards, so addresses can't be listed
  at creation. The agreed order is the order people join.
- **`entryDeposit ≥ C` is enforced**, so the deposit always covers a full missed payment. Any rebated part is backed by the reserve.
- **Pull-grant cadence:** rounds must strictly increase, and `pulls ≤ elapsed / period + 1` since the grant.
  This tolerates keeper timing jitter without allowing bursts.
- **Collection is grief-resistant:**
  - Success is measured by the AUSD actually received, never by the member account's return value.
  - Each member-account call gets a fixed 250k gas budget, and `collect` reverts if the caller supplies too little
    gas to honour it, so nobody can starve a pull to get an honest member marked late.
  - A partial transfer becomes the member's credit; an excess becomes withdrawable.
- **Payout to an address the token refuses** (e.g. a blocklist) becomes withdrawable instead of blocking the circle.
- **An ejected member** gets their posted collateral and any earned discount credit back immediately, and the 90%
  refund at completion. The lifecycle fuzzer caught an early version that forgot the collateral.
- **Ejection when the ejected member was the last one to receive:** that round becomes the settlement slot
  (`_cancelRound`).
- **Scoring:** the on-time component ramps up over the first 12 payments, so a single payment isn't "history".
  Formulas are in `docs/economics.md` §5 and §7.
- **`nextAction()` view:** tells keepers (CRE workflow and fallback) what's due, so both share one decision rule.
