# @turn/relayer

Turn's gasless relayer. Users never hold MON: their mera passkey EOA signs an **EIP-7702 authorization**
(delegating to `TurnAccount`) and an **EIP-712 batch**. The relayer submits a type-4 transaction and pays the gas.

```
POST /v1/relay            { account, calls[], nonce, deadline, signature, authorization? } -> { ok, txHash, gasUsed }
GET  /v1/accounts/:addr   -> { delegated, nonce, eoaNonce, accountImplementation, gasUsedToday, gasLimitPerDay }
GET  /health
```

The web app builds and signs requests with `@turn/relayer/client` (`signRelayRequest`, `executeTypedData`).

## Safety model

- **It can censor, but it can't steal.** Every batch carries the user's EIP-712 signature over the exact calls,
  nonce, deadline and chain. `TurnAccount` checks the signature onchain, so the relayer can only submit or refuse.
  Users can always self-submit with `executeSelf` from their own EOA.
- **Allowlist, checked twice** (here and in `TurnAccount`): AUSD, `CircleFactory`, factory-registered circles, and the
  account's own `grantPull`/`revokePull`.
- **Free rejection:** every batch is simulated with `eth_estimateGas` first. A bad signature, expired deadline or
  revert is rejected before anything is spent.
- **Gas limits:** Monad charges the gas *limit*, so each call gets estimate + 10%, capped by `MAX_GAS_PER_TX`, and
  each account has a `DAILY_GAS_PER_ACCOUNT` budget (charged by limit). Rates are limited per IP and per account.
- **Delegation:** an authorization must delegate to the Turn `TurnAccount` implementation on this chain; anything
  else is rejected.
- **Zero-MON users are fine:** Monad reverts transactions that *lower* a delegated EOA's balance below 10 MON.
  Turn users hold 0 MON and `TurnAccount` never moves value, so their balance never changes.

Rate-limit and budget state is in memory for the hackathon deployment (single instance). `RelayerStore` is the
interface to swap in Redis or Postgres.

## Run

```bash
cp ../.env.example ../.env   # RELAYER_PRIVATE_KEY, RPC_URL, CHAIN_ID (addresses come from contracts/deployments)
pnpm dev                     # http://localhost:8787
pnpm test                    # anvil (Prague) + real deploy script + HTTP flows, 12 tests
pnpm verify-7702             # live check on Monad testnet (needs a funded relayer)
```
