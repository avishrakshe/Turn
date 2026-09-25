# Turn — Phase 1 Plan

Status: **draft, waiting for answers to the open questions in §4**. Written 2026-09-26.

## 1. Understanding (one paragraph)

Turn is an onchain ROSCA ("committee" / chit fund) on Monad. It is built for Indian families
and Gulf-based migrant workers who already run monthly committees across the UAE→India corridor. N members
(3–20) each contribute C AUSD per period. Each round one member receives the pot: either in a
fixed order, or by a discount auction where the discount is shared with everyone else as
credit. Defaults are covered by an entry deposit (before winning) or by collateral withheld
from the payout (after winning). The collateral required shrinks as a member builds an onchain credit
record. The user sees Face ID, their own currency, and plain language. They never see gas,
addresses, chains, or signatures. mera (passkey EOAs) + EIP-7702 (TurnAccount delegate) + our
relayer make everything gasless. Envio is the source of truth for history. Chainlink CRE runs
the rounds and sends FX-priced Telegram notifications.

## 2. Verified facts

| Fact | Value | Source |
| --- | --- | --- |
| Monad mainnet chain ID | `143` (confirmed via `eth_chainId` = `0x8f`) | docs.monad.xyz/developer-essentials/network-information |
| Monad testnet chain ID | `10143` (confirmed via `eth_chainId` = `0x279f`) | docs.monad.xyz/developer-essentials/testnets |
| Testnet RPC / explorer / faucet | `https://testnet-rpc.monad.xyz`, `testnet.monadvision.com`, `testnet.monadscan.com`, `faucet.monad.xyz` | same |
| Testnet reset | Testnet was reset from genesis on 2025-12-16 | same |
| AUSD mainnet | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`, `decimals()` = **6**, symbol `AUSD` (read on-chain) | docs.agora.finance/developer/contract-deployments |
| AUSD testnet | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, `decimals()` = **6**, symbol `AUSD` (read on-chain) | same |
| Gas charging | Charged on **gas limit**: `value + gas_bid * gas_limit` | docs.monad.xyz/developer-essentials/differences |
| Mempool / history | No global mempool; full nodes don't serve arbitrary historic state | same |
| Contract size | 128 KB max code size | same |
| P256 precompile | `secp256r1` verify precompile at `0x0100` | same |
| 7702 reserve balance | A delegated EOA's tx that would **reduce** its MON balance below 10 MON reverts unconditionally. If the balance is unchanged or increased, the tx succeeds | docs.monad.xyz/developer-essentials/eip-7702 |
| 7702 CREATE | `CREATE`/`CREATE2` revert when code runs **in the delegated EOA's context** | same |
| 7702 sponsorship | Type `0x04` txs: the EOA signs an authorization tuple and a sponsor submits it. Delegation persists until changed | same |
| mera package | `@category-labs/mera`; `getPasskeyPrfOutput`, `createSecp256k1SigningSession`, `toViemAccount` (from `@category-labs/mera/viem`) | mera.category.xyz |
| mera viem account | `LocalAccount<"mera">` with `signTransaction`, `signMessage`, **`signTypedData` (EIP-712)**, **`signAuthorization` (EIP-7702)** | mera.category.xyz/recipes/send-a-transaction-with-viem |
| mera sessions | Key held **in memory** only; `end()` zeroes it; the next signature then needs a new passkey ceremony | mera.category.xyz/concepts/signing-sessions |
| mera accounts | PRF(credential, rpId, salt) → BIP-39 seed → HD derivation by index. Same passkey gives same accounts on every device. Creation takes 1 prompt (2 on authenticators without PRF-at-create) | mera.category.xyz/recipes/create-passkey-accounts |
| Envio | HyperIndex/HyperSync support Monad mainnet (`https://monad.hypersync.xyz`) and testnet | envio.dev/chains/monad |
| CRE on Monad | Monad mainnet (CLI ≥ 1.29) and **testnet (CLI ≥ 1.30, TS SDK ≥ 1.19)** supported | docs.chain.link/cre/supported-networks-ts |
| CRE forwarders | Testnet simulation `0xB9F79d863261869B234c481D1f9A7af84AeAd192`; testnet production `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`. CRE writes via forwarder → consumer `onReport` (IReceiver) | docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts |
| Mercuryo sandbox | Needs credentials + IP whitelisting from a Mercuryo integration manager | widget.docs.mercuryo.io/guide/getting-started/sandbox |

### Not verified / flagged
- **Block time.** Search results mention 300 ms blocks after "MIP-12" as well as the 400 ms in the brief.
  This doesn't affect the design: all timing uses second-granularity `block.timestamp`.
- **mera fresh-device sign-in.** The docs don't say whether sign-in works with a discoverable credential
  (no stored `credentialId`). This matters for the stateless test. I'll check in the mera source
  in Phase 5. If it needs a `credentialId`, it will come from a relayer-side lookup keyed by the
  WebAuthn user handle, and nothing will be stored in localStorage.
- **mera mnemonic export.** There's no dedicated API. The recipe derives the mnemonic from the PRF output with
  `entropyToMnemonic`. Export = re-run that behind a fresh passkey ceremony.
- **Testnet AUSD funding.** I found no public AUSD faucet on Monad testnet (see Q4).
- **Mercuryo AUSD on Monad.** Not confirmed as a supported asset (see Q5).
- **CRE production deploy.** May require early access. CLI simulation is the baseline.

## 3. Design decisions from the verified facts

1. **Auto-pay sessions are enforced by the contract, not by keeping a mera key alive.**
   mera sessions live in memory and die on reload, so they can't power "prompt-free contribution
   every month". Instead, the join batch includes `TurnAccount.grantPull(circle, maxAmount=C,
   period, validUntil=circleEnd)`. After that, `Circle.collect()` calls
   `TurnAccount(member).pullContribution(round, amount)`, and TurnAccount enforces the
   scope on-chain:
   - the caller is a factory-registered Circle with an active grant
   - `amount ≤ maxAmount`
   - one pull per round, at least `period` seconds apart (small tolerance)
   - `block.timestamp ≤ validUntil`
   - not revoked

   No passkey prompt and no signer are needed per payment. Revocation is an owner-signed
   (EIP-712) relayed call. A member who isn't delegated (e.g. a judge using MetaMask) falls back to
   a plain AUSD `transferFrom` allowance.
2. **One Face ID for onboarding and join.** A single mera ceremony opens an in-memory session that
   signs the 7702 authorization **and** the EIP-712 batch (approve/join/deposit/grantPull). The
   relayer submits one type-4 tx. That's one prompt → first confirmed tx.
3. **Reserve balance is a non-issue by construction.** Users hold 0 MON and TurnAccount rejects
   any call with `value > 0`, so a delegated EOA's MON balance is never reduced. TurnAccount never
   uses CREATE. Circle clones are created by the factory in its own context. I'll confirm this on
   testnet in Phase 3 before building on it.
4. **Relayer gas.** Because gas is charged on the limit, the relayer runs `eth_estimateGas`, adds
   a 10% buffer, applies a hard per-call-type cap, and enforces a per-account daily cap. The relayer can
   censor but can't steal: every relayed call carries the user's EIP-712 signature (nonce, deadline,
   chainId), and TurnAccount allowlists targets (AUSD, factory, factory-registered Circles, self).
5. **CRE writes through a receiver.** `TurnKeeper` implements `IReceiver.onReport`, only
   trusts the CRE forwarder, decodes `(circle, action, args)` and calls the permissionless round
   function. The Node fallback keeper calls the Circle functions directly with the same decision
   logic, shared as a TS module.
6. **Round timeline (per round, from `roundStart`):**
   `collect` is open from `roundStart` → bids are accepted during `[roundStart, roundStart+bidWindow)` →
   `closeAuction` → `payout` once every member is **paid** or **covered**. Covered means marked in
   default after `gracePeriod`, with the shortfall filled from deposit/collateral. So a late payer
   delays the payout by at most `gracePeriod` and never shrinks the pot. Demo:
   period 300 s, bidWindow 120 s, grace 60 s.
7. **Entry deposit counts toward the winner's collateral** (assumption A3). After winning, the member no
   longer needs a separate deposit, so it's folded into their collateral.

## 4. Open questions (need your answers)

- **Q1: Agora "Best Cross-Border Payments App on Monad".** Please paste the exact criteria.
- **Q2: Mera "One Passkey, Many Keys".** Please paste the exact criteria. My guess is that it rewards
  deriving several keys/accounts from one passkey (mera HD indices). A natural fit for Turn is
  **one account per circle**, or a separate "savings" account and "spending" account, all from one
  passkey. I'll hold off until I see the criteria.
- **Q3: Collateral when trustDiscount > 0.** With trust discount d, collateral covers only
  (1−d) of the winner's remaining debt. If a trusted winner stops paying entirely, collateral runs
  out. That breaks "others never receive less" unless something else covers the gap. Options:
  - **(a) Recommended:** a per-circle **protection reserve** funded by a fixed slice (e.g. 10%) of every
    auction discount plus ejection penalties. Beyond that, the shortfall is shared pro-rata and
    disclosed. This is a documented second exception.
  - (b) Keep trustDiscount, and have the winner's credit record absorb the loss socially (onchain
    default). Others bear the shortfall. Simpler, but it breaks the promise.
  - (c) Cap trustDiscount so collateral + entry deposit always ≥ remaining debt
    (i.e. trust only reduces the lock by at most the deposit). Keeps the promise absolutely, but trust matters much less.
- **Q4: Ejection refund funding.** An ejected non-winner's past contributions have already gone to
  earlier winners' pots, so the circle doesn't hold that money. Where does the "refund at end minus 10%" come
  from? Options:
  - **(a) Recommended:** the circle ends one round early (N−1 rounds). The refund is funded by an equal
    extra settlement contribution from members who already won with the ejected member's money.
    The early winners are the ones who received it, and their collateral backs that obligation.
  - (b) The refund is deducted pro-rata from remaining pots (the "documented exception").
- **Q5: Discount credit recipients.** Is the credit split among *all* other active members
  (including earlier winners), as in a traditional chit fund? I'm assuming **yes**.
- **Q6: Testnet vs mainnet and funds.** Monad testnet has an official AUSD
  (`0xa901…22dC`) but I found no public faucet. Options:
  - **(a)** You ask Agora (bounty contacts) for testnet AUSD.
  - **(b)** Go mainnet with real AUSD and small amounts. The relayer then needs real MON.
  - **(c) Fallback:** a clearly labelled `TestAUSD` (6 decimals, faucet) used only if (a) fails. It
    isn't the Agora token, which would weaken the Agora bounty, so it's a last resort.
- **Q7: Mercuryo.** Sandbox needs credentials and IP whitelisting from their integration manager. Can
  you request them now? AUSD-on-Monad support is also unconfirmed. If they only support e.g.
  USDC on Monad, "Add money" becomes on-ramp USDC, then a swap step, which needs a DEX. Please tell me
  what they support.
- **Q8: Team and names** for the pitch, submission, and LICENSE copyright line.
- **Q9: Foundry on Windows.** `forge` isn't installed here. Options:
  - Install Foundry natively: `foundryup` needs Git Bash, or there's the Windows binary release.
  - Use WSL.
  - Monad's Foundry fork, if needed. I'll check whether it's still recommended.

  Which do you prefer?

## 5. Assumptions (I'll proceed on these unless you object)

- A1: Package manager **pnpm** workspaces (pnpm 11 is installed). Node 24.
- A2: Testnet first (10143). Mainnet deploy only if Q6(b).
- A3: Entry deposit counts toward the winner's collateral requirement.
- A4: FIXED_ORDER mode uses the same pipeline with no bid window. The winner is `order[r]`.
- A5: If nobody bids, the eligible member with the highest `CreditRegistry.score` wins, with ties broken by join order.
  Everyone starts with score 0, so this reduces to join order for new users.
- A6: Credit balances offset the next contribution first. Any leftover credit is claimable at completion.
- A7: The display currency is stored per member in the indexer via an event (`MemberProfileSet`), not
  only in the browser, so it survives the stateless test. FX conversion is display-only.
- A8: Bids above a threshold (e.g. > 10% discount) need a fresh Face ID. Smaller bids go through the
  in-memory mera session while the app is open. After a reload, any bid requires one Face ID.
- A9: The feedback prompt stores ratings in a relayer-side store (tiny KV/Postgres) keyed by
  account. It's off-chain, used only for traction.md, and clearly disclosed.

## 6. File tree (target)

```
Turn/
├── package.json, pnpm-workspace.yaml, .env.example, README.md
├── contracts/                      @turn/contracts
│   ├── foundry.toml
│   ├── src/
│   │   ├── CircleFactory.sol
│   │   ├── Circle.sol
│   │   ├── CreditRegistry.sol
│   │   ├── TurnAccount.sol         (EIP-7702 delegate, ERC-7201 storage)
│   │   ├── TurnKeeper.sol          (CRE IReceiver → permissionless round calls)
│   │   ├── libraries/TrustMath.sol
│   │   ├── libraries/CircleTypes.sol
│   │   └── interfaces/ (ICircle, ICircleFactory, ICreditRegistry, ITurnAccount, IReceiver)
│   ├── test/
│   │   ├── unit/ (one file per contract + TrustMath)
│   │   ├── fuzz/, invariant/ (CircleInvariant: balance == Σ collateral+deposits+credits+pot)
│   │   └── scenario/ (the 7 required scenarios)
│   └── script/ (Deploy.s.sol, SeedDiasporaCircle.s.sol)
├── relayer/                        @turn/relayer   (Hono on Node 24, viem)
│   └── src/ (server.ts, policy.ts [allowlist, rate limit, gas caps], submit.ts [type-4], store.ts)
├── indexer/                        @turn/indexer   (Envio HyperIndex)
│   ├── config.yaml, schema.graphql
│   └── src/EventHandlers.ts
├── automation/                     @turn/automation
│   ├── cre/ (workflow.ts, config.json, project.yaml: cron → read → decide → report; FX; Telegram)
│   ├── keeper/ (fallback Node keeper)
│   └── shared/decide.ts  (the one decision function both use)
├── web/                            @turn/web  (Next.js App Router, Tailwind, wagmi/viem, mera, PWA)
│   ├── app/ (landing, onboarding, home, create, join/[code], circle/[id], add-money,
│   │         credit/[address], settings, metrics, api/credit/[address])
│   ├── lib/ (mera.ts, relayer.ts, envio.ts, fx.ts, sessions.ts)
│   └── e2e/ (playwright: stateless.spec.ts, onboarding.spec.ts)
└── docs/ (plan.md, economics.md, submission.md, *-script.md, traction.md, ACCESS.md,
           architecture.md, logo.png)
```

## 7. Contract interfaces (sketch)

```solidity
// CircleTypes
enum Mode { FIXED_ORDER, AUCTION }
enum Status { FORMING, ACTIVE, COMPLETED, CANCELLED }
enum MemberState { NONE, ACTIVE, EJECTED }
struct Params { uint8 n; uint128 contribution; uint32 period; Mode mode;
                uint16 maxDiscountBps; uint32 bidWindow; uint32 gracePeriod; uint128 entryDeposit; }

interface ICircleFactory {
  event CircleCreated(address indexed circle, address indexed creator, Params params, bytes32 inviteHash);
  function createCircle(Params calldata p, address[] calldata fixedOrder, bytes32 inviteHash) external returns (address);
  function isCircle(address) external view returns (bool);
}

interface ICircle {
  // lifecycle
  function join(bytes32 inviteSecret) external;          // pulls entryDeposit
  function collect() external;                            // permissionless, idempotent, try/catch per member
  function bid(uint16 discountBps) external;              // AUCTION, eligible members, within window
  function closeAuction() external;                       // permissionless after bidWindow
  function payout() external;                             // permissionless once all paid/covered
  function markDefault(address member, uint256 round) external; // permissionless after grace
  function postCollateral(uint256 amount) external;       // optional external collateral
  function claim() external;                              // after completion: deposits, collateral, credits, refunds
  // views: currentRound, roundInfo, memberInfo, requiredCollateral(member, round), status
  // events: Joined, CircleStarted, ContributionPaid(member, round, amount, creditUsed, onTime),
  //         ContributionLate, BidPlaced, AuctionClosed, PayoutMade(winner, round, gross, discount, withheld),
  //         CreditAccrued, CollateralReleased, DefaultMarked(member, round, coveredFrom), MemberEjected,
  //         CircleCompleted, Claimed
}

interface ICreditRegistry {
  struct Record { uint32 circlesJoined; uint32 circlesCompleted; uint32 paymentsOnTime;
                  uint32 paymentsLate; uint32 defaults; uint128 totalContributed; }
  function recordOf(address) external view returns (Record memory);
  function score(address) external view returns (uint256);   // 0..1000
  // writes: onlyRegisteredCircle (factory-authorised)
}

library TrustMath {
  function trustDiscountBps(ICreditRegistry.Record memory r) internal pure returns (uint16); // capped 8000
  function requiredCollateral(uint256 remainingRounds, uint256 c, uint16 trustBps) internal pure returns (uint256);
}

interface ITurnAccount { // runs as the mera EOA via EIP-7702
  struct Call { address target; bytes data; }             // value always 0
  function execute(Call[] calldata calls, uint256 nonce, uint256 deadline, bytes calldata sig) external;
  function grantPull(address circle, uint128 maxAmount, uint32 period, uint64 validUntil) external; // self-call only
  function revokePull(address circle) external;           // self-call only (i.e. via signed execute)
  function pullContribution(uint256 round, uint256 amount) external; // called by Circle; scope-checked
}
```

## 8. Session design (summary)

| Action | Prompt? | Enforced by |
| --- | --- | --- |
| Onboard + first join (7702 auth + batch) | 1 Face ID | mera ceremony; relayer type-4 |
| Monthly contribution | **None** | TurnAccount pull grant (circle, ≤ C, once/round, until end) |
| Bid ≤ threshold while app open | None (in-memory mera session) | EIP-712 signature, nonce + deadline |
| Bid > threshold, join new circle, withdraw/claim, change payout destination, revoke/renew grant | Face ID | new mera ceremony per action |
| Export recovery phrase | Face ID | Settings only |
| Grant expiry | Banner: "Auto-pay for *Family Circle* ended. Turn it back on?" and one tap → Face ID | `validUntil` |

Next step after your answers: Phase 2 (contracts + full test suite).
