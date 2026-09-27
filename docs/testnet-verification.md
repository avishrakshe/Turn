# Monad testnet: live verification of the gasless design (2026-09-26)

Run with `pnpm --filter @turn/relayer verify-7702` against the testnet deployment (`contracts/deployments/10143.json`).
It goes through the real relayer HTTP app and exercises the assumptions Phase 1 flagged for testing on Monad.

| Check | Result |
| --- | --- |
| A user EOA holding **0 MON** is delegated to `TurnAccount` by a relayer-sponsored **type-4** tx | ✅ code = `0xef0100` + `0x64a8…6898` |
| approve + createCircle (+ join) + grantPull execute **in that same tx** | ✅ |
| The user's MON balance stays **0** (Monad reserve-balance rule only reverts *decreases*) | ✅ |
| Two more zero-MON users join the same way; the circle starts | ✅ status ACTIVE |
| Follow-up batch needs **no authorization** (delegation persists) | ✅ type `eip1559` |
| `collect` pulls all contributions through **onchain pull grants** (no allowance, no prompt) | ✅ payState = PAID ×3 |

Transactions (explorer: <https://testnet.monadvision.com>):

- User 0, delegate + create + grant: [`0x7cb17632…d657`](https://testnet.monadvision.com/tx/0x7cb176328269376f4ee51a1dbc572995fb26dfb1b22d929ca4c8748b537dd657)
- User 1, delegate + join + grant: [`0x7460c047…4e52`](https://testnet.monadvision.com/tx/0x7460c04788ccf3b9e9182c32c5b00314161e1a3485bc6e295be20e5ecfe64e52)
- User 2, delegate + join + grant (starts the circle): [`0x4f33db66…3d02`](https://testnet.monadvision.com/tx/0x4f33db660018ddadb3bd8c8ef47e6ad4d8696c9332fd6958ea46adf26a843d02)
- User 0 follow-up (no authorization): [`0x68461943…4811`](https://testnet.monadvision.com/tx/0x6846194311c4cc302f685f88c6bda2c23a79262dc428b52f7d6721d4e5054811)
- Keeper collect: [`0x328f840f…076e`](https://testnet.monadvision.com/tx/0x328f840ff2554ce99cf9cccfb18fe8d0f757c01705097a6f5141a0fe5b3e076e)
- Circle: [`0xdeeF3A00…abd0`](https://testnet.monadvision.com/address/0xdeeF3A00080B8AA785f7E157eC17F9E82eAbabd0)

## Automation: the fallback keeper finishes the circle (2026-09-27)

`automation/keeper/run-until-done.ts` ran the shared decision rule against the same circle until it completed.
All 8 actions succeeded, and rounds 2 and 3 were collected through the members' **onchain auto-pay grants**, with
no member signing anything:

| Round | Actions | Net paid to recipient |
| --- | --- | --- |
| 1 | closeAuction → payout | 2 mAUSD (1 withheld as collateral: 2 rounds still owed) |
| 2 | collect → closeAuction → payout | 3 mAUSD |
| 3 | collect → closeAuction → payout | 4 mAUSD (full pot + deposit back) |

The hosted Envio indexer then showed the circle as `Completed`, 9/9 payments on time, health 100, and AED↔INR
cross-border corridor volume.

Gas observations are in `docs/gas.md`. Monad bills the gas limit, and real costs are about 25–30% above local EVM numbers.
