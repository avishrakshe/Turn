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

Collection cost grows about linearly with N (roughly 120–130k per member via a pull grant, including the
CreditRegistry write).

Full per-function table: `contracts/gas-report.txt` (`forge test --gas-report`). Snapshot: `contracts/.gas-snapshot`.
