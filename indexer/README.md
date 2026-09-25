# @turn/indexer

Envio HyperIndex for Turn on Monad. It is the app's source of truth for history: Monad full nodes don't serve
historical state, and the web app reads circles, rounds, live bids, credit and stats from here, never from raw RPC.

## What it indexes

| Source | How |
| --- | --- |
| `CircleFactory` | Fixed address. `CircleCreated` registers each new circle dynamically |
| `Circle` (clones) | All 22 lifecycle events. `Joined` also registers the member's account ⤵ |
| `TurnAccount` | EIP-7702: events are emitted **at each member's own EOA**, which is registered when they join (auto-pay sessions) |
| `CreditRegistry` | `RecordUpdated`: score and trust computed with an exact port of `TrustMath.sol` |

**Entities.**

- Per wallet and circle: `Member` (cross-circle credit score, on-time rate, trust level, totals), `Membership`, and `Circle` (health score, collected vs expected, reserve and exposure).
- Per round: `Round` (live best bid, winner, payout breakdown), `Bid`, `Payment` (paid or covered), `Payout`, and `Default` (incl. ejections).
- Auto-pay: `Session` (auto-pay grants).
- Aggregates: `CorridorStats` (e.g. AED→INR volume, cross-border flag, circle count) and `GlobalStats` (network totals, on-time rate, cross-border volume).

## Develop

This is a standalone pnpm project, because Envio Cloud builds it on its own with pnpm 10.32.0.

```bash
npx pnpm@10.32.0 install
cp .env.example .env         # addresses from ../contracts/deployments/<chainId>.json
npx pnpm@10.32.0 codegen
npx pnpm@10.32.0 test        # simulated events: lifecycle, auction, sessions, credit, corridors, ejection
npx pnpm@10.32.0 dev         # local run (Docker)
```

After contract changes, run `node ../contracts/scripts/export-abis.mjs` to refresh `abis/`.

## Deploy to Envio Cloud

1. Go to <https://envio.dev/app>, log in with GitHub, and install the **Envio Deployments** GitHub App on `avishrakshe/Turn`.
2. Add an indexer with these settings:
   - **Root directory:** `indexer`
   - **Config file:** `config.yaml`
   - **Deployment branch:** `envio` (or `main`)
3. Environment variables (only needed while `config.yaml` uses placeholders): `ENVIO_FACTORY_ADDRESS`,
   `ENVIO_REGISTRY_ADDRESS`, `ENVIO_START_BLOCK`.
4. Push the deployment branch. The dashboard shows the production GraphQL endpoint.

CLI alternative: `npx envio-cloud login`, then
`npx envio-cloud indexer add --name turn --repo Turn --branch envio`.
