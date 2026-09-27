# @turn/web

The Turn app: a mobile-first Next.js PWA. Users never see a wallet, gas, a chain name or a signature. They see
Face ID, their own currency and plain language.

## How it works

- **Passkey namespaces (mera)**, all in [`lib/passkey.ts`](lib/passkey.ts). One passkey, several isolated PRF salts:

  | Namespace | Salt | Use |
  | --- | --- | --- |
  | account | `sha256("turn.v1.account")` | BIP-39 → `m/44'/60'/0'/0/0` → the user's EOA. A standard wallet: the exported phrase opens it in MetaMask |
  | vault | `sha256("turn.v1.vault")` | HKDF → AES-256-GCM: a private address book ("Mom", "Ravi bhai"). The server stores ciphertext only |
  | invite | `sha256("turn.v1.invite")` | HMAC(circle): invite links rebuilt from the passkey on any device, never stored |

  Onboarding evaluates only the account salt: **one Face ID**. The other namespaces unlock when first used. Every
  output lives in memory only.
- **Gasless.** Every action is one EIP-712-signed batch submitted by the relayer, which is served by this app at
  `/api/relayer` from [`@turn/relayer`](../relayer). A user's first action carries the EIP-7702 authorization, so
  approve + join + auto-pay is **one sponsored transaction**.
- **Auto-pay.** Joining grants the circle an onchain pull permission (TurnAccount): only that circle, at most one
  contribution per round, until the circle ends. It can be revoked in Settings, and Home shows a banner if it's off.
- **Stateless.** Circles, rounds, live bids, payments, credit and network stats come from the **Envio** indexer.
  Balances come from RPC. Nothing essential lives in browser storage: wipe it, sign in with the passkey, and
  everything comes back (tested end to end).
- **Screens:** landing, onboarding, home, create (with WhatsApp/Telegram invite), join via link, circle (timeline,
  member status, live auction, payout celebration, withdraw), add money, credit profile (`/credit/[address]` plus
  `/api/credit/[address]`), settings (currency, auto-pay, Telegram, recovery phrase behind Face ID), people
  (encrypted names), `/stats` (network analytics) and a hidden `/metrics` page (time to first transaction, feedback).

## Run

```bash
pnpm dev                      # testnet by default (Monad 10143 + hosted Envio); needs RELAYER_PRIVATE_KEY in env
pnpm test                     # unit: namespaces, derivation, vault encryption, invite determinism
bash ../scripts/local-up.sh   # local chain + indexer, then:
pnpm e2e                      # Playwright with a virtual passkey (PRF): onboarding, gasless create/join, vault, stateless
```

Server env: `RELAYER_PRIVATE_KEY`, optional `RPC_URL` and `CHAIN_ID`, and `KV_REST_API_URL` / `KV_REST_API_TOKEN`
(Upstash Redis) for vault ciphertext, metrics and feedback. Without them, an in-memory store is used.
Client overrides are `NEXT_PUBLIC_*` (see [`lib/config.ts`](lib/config.ts)).

**Cross-device test.** Chrome's virtual authenticator can't export a passkey's PRF secret, so "same passkey,
different device" is checked manually with a synced passkey (iCloud Keychain or Google Password Manager). The
automated stateless test wipes all site data in the same browser.
