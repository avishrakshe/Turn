# Gas

Measured by `contracts/test/gas/FlowGas.t.sol`, which fails if any number exceeds its cap. Setup: an N = 5 AUCTION
circle, every member an EIP-7702 `TurnAccount`, standard EVM gas schedule. Monad reprices some opcodes and
**charges the gas limit, not gas used**. So the relayer and keeper estimate every call (`eth_estimateGas`), add
10%, and never submit above the caps below. Batching (approve + join + grant in one tx) saves a transaction's
overhead per step.

| Flow | Gas used | Cap (test + relayer) |
| --- | --- | --- |
| Relayed: approve + createCircle (+ creator joins) + grantPull | 666,207 | 750,000 |
| Relayed: approve + join + grantPull | 282,428 | 350,000 |
| Relayed: approve + join + grantPull (5th member, starts circle) | 495,099 | 600,000 |
| Relayed: bid | 126,507 | 150,000 |
| Relayed: revoke auto-pay | 78,989 | 100,000 |
| Keeper: collect (5 members via pull grants) | 665,830 | 800,000 |
| Keeper: collect (10 members, the mainnet cap) | 1,248,094 | 1,500,000 |
| Keeper: closeAuction | 84,670 | 150,000 |
| Keeper: payout (with discount credits + reserve) | 335,406 | 450,000 |
| Keeper: markDefault (covered by collateral) | 143,588 | 250,000 |

## Measured on Monad testnet (2026-09-26, `relayer/scripts/verify-7702.ts`)

Monad receipts report gas used = gas limit, because the limit is what's billed. Its opcode pricing (notably cold
storage access) makes real costs about 25–30% higher than the local EVM numbers above:

| Flow (3-member circle) | Local EVM | Monad testnet (billed) |
| --- | --- | --- |
| Relayed type-4: delegate + approve + createCircle + grantPull | ~666k | 828,845 |
| Relayed type-4: delegate + approve + join + grantPull | ~282k | 407,137 |
| Relayed type-4: delegate + approve + join + grantPull (starts circle) | ~495k | 592,676 |
| Keeper: collect (3 members via pull grants) | — | 767,690 |

So the relayer's per-transaction cap defaults to **1.2M** gas. At about 100 gwei, a gasless join costs the
relayer about 0.04 MON, and onboarding plus creating a circle about 0.08 MON.

Collection cost grows about linearly with N (roughly 120–130k per member via a pull grant, including the
CreditRegistry write).

Full per-function table: `contracts/gas-report.txt` (`forge test --gas-report`). Snapshot: `contracts/.gas-snapshot`.
