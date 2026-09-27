# @turn/contracts

Solidity contracts for Turn savings circles on Monad (Foundry).

| Contract | Role |
| --- | --- |
| `CircleFactory` | Deploys circles as EIP-1167 clones, registers them with the CreditRegistry, mainnet-beta limits + pause (new circles/joins only) |
| `Circle` | One savings circle: joins, collection, discount auction, payouts, collateral, protection reserve, defaults, ejection, settlement |
| `CreditRegistry` | Non-transferable savings history per wallet; `score()` and `trustBps()` |
| `TrustMath` | Pure scoring/trust rules (tunable constants) |
| `TurnAccount` | EIP-7702 delegate for mera passkey EOAs: EIP-712 relayed batches + onchain auto-pay grants |
| `TurnKeeper` | Chainlink CRE consumer (`onReport`) that runs due round actions |
| `MockAUSD` | **Test only** 6-decimal stand-in for AUSD (local + testnet) |

The economics and the invariants (I0 accounting, I1 exposure ≤ reserve, I2 no member worse off, I3 pot size)
are described in `../docs/plan.md` and `../docs/economics.md`.

## Commands

```bash
forge build
forge test                      # unit, fuzz, scenario, invariant
forge test --gas-report
forge coverage --ir-minimum --no-match-coverage "(test|script)/"
FOUNDRY_PROFILE=ci forge test   # more fuzz/invariant runs
```
