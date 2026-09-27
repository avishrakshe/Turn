# @turn/automation

Keeps every Turn circle running on schedule and tells members what happened, in their own currency.
There are two keepers, and they share one decision rule ([`shared/decide.ts`](shared/decide.ts)), which reads each circle's
own `nextAction()` view:

| | Primary: **Chainlink CRE workflow** ([`cre/turn-keeper`](cre/turn-keeper)) | Fallback: **Node keeper** ([`keeper/`](keeper)) |
| --- | --- | --- |
| Trigger | Cron (every minute) | Loop (`KEEPER_INTERVAL_SECONDS`) |
| Reads Monad | `EVMClient.callContract`: factory → circles → `nextAction`, round, members | viem `readContract` (same reads) |
| Acts | One consensus-signed report → Chainlink forwarder → `TurnKeeper.onReport` → `collect` / `closeAuction` / `payout` / `markDefault` | Calls the same permissionless circle functions directly |
| External API | FX rates from `open.er-api.com` (median across nodes) | Same API |
| External system | Telegram Bot API `sendMessage` (POST cached so nodes don't double-send) | Same message, via `fetch` |

Every round function is permissionless, so neither keeper has special power. `TurnKeeper` only accepts reports
from the configured Chainlink forwarder, and if one job fails the rest still run. Messages never mention gas,
transactions or chains:

> 🔔 Family Circle, round 2: contributions of ₹9,588 · AED 367.25 · £75.51 were collected by auto-pay. Bidding for this round's pot (₹28,764 · AED 1,101.75 · £226.53) is open for the next 2 minutes.
>
> ⚠️ Family Circle, round 2: a payment from 0x6C28…2A18 didn't arrive in time. It was covered by their deposit or collateral, so everyone still receives the full pot.

## CRE workflow

Chain: `monad-testnet` (selector `2183018362218727504`, from the SDK's network table; needs CLI ≥ 1.30 and SDK ≥ 1.19;
we use CLI 1.35 and SDK 1.22). The TurnKeeper receiver is `0x92B4…0771`, which trusts the CRE **simulation**
forwarder `0xB9F7…D192` so `simulate --broadcast` can write for real. Switch it to the production forwarder
`0xF834…4482` with `setForwarder` (owner only) before deploying the workflow to a DON.

```bash
# once: install the CLI and log in (browser)
curl -sSL https://app.chain.link/cre/install.sh | bash && cre login
npm i -g bun                               # SDK needs Bun >= 1.2.21
cp cre/.env.example cre/.env               # CRE_ETH_PRIVATE_KEY (funded), TELEGRAM_BOT_TOKEN
pnpm cre:install && pnpm cre:compile       # typecheck + compile to WASM
cd cre && cre workflow simulate turn-keeper --target staging-settings --broadcast
```

Set `telegramChatId` in `cre/turn-keeper/config.staging.json` to enable notifications (leave it empty to disable).

## Fallback keeper

```bash
pnpm keeper                                # reads ../.env: RPC_URL, CHAIN_ID, KEEPER_PRIVATE_KEY (or RELAYER_PRIVATE_KEY)
# optional: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

## Tests

`pnpm test` runs:
- the decision rule, the report encoding and the currency formatting;
- an **anvil** test where the fallback keeper alone drives a circle to completion, including a missed payment;
- a test where a CRE-encoded report is executed by the real `TurnKeeper` when delivered by the forwarder address,
  and rejected from anyone else.
