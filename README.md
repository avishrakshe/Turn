# Turn

> **Save together. Take turns.**

Turn brings the rotating savings circle — the chit fund, tanda, susu, or committee that
millions of people already run with friends, family, and coworkers — on-chain. A group forms
a **Circle**, every member contributes a fixed amount of stablecoin each round, and each round
one member receives the pot. Who takes their turn early is decided by an auction, where members
bid a discount that is shared with everyone else, and posted collateral covers members who stop
paying. Members sign in with a passkey and never need a seed phrase or gas, and they can pay in
with a card through an on-ramp.

Built on **Monad** for the Monad **Metropolis** hackathon — **Track 2: Consumer Products & Payments**.
Our first users: Indian families and migrant workers in the UAE and the Gulf who already run
monthly committees with relatives back home.

## Status

🚧 Early development. This README grows as the project does. Live demo, deployed addresses,
the indexer endpoint, and videos will be listed here once they exist.

## Tech stack

| Layer | Technology |
| --- | --- |
| Chain | Monad (testnet 10143, mainnet 143) |
| Smart contracts | Solidity, Foundry |
| Stablecoin | Agora AUSD |
| Wallet / onboarding | mera (passkey wallets) |
| Indexing | Envio (HyperIndex, GraphQL) |
| Automation | Chainlink CRE (round scheduling, auction settlement) |
| Fiat on-ramp | Mercuryo |
| Web app | Next.js (App Router), TypeScript, PWA |
| Relayer | Node.js / TypeScript (sponsored transactions) |

## Repository structure

```
Turn/
├── contracts/    # @turn/contracts   — Foundry: CircleFactory, Circle, CreditRegistry, TrustMath, TurnAccount
├── relayer/      # @turn/relayer     — gasless relayer (EIP-7702 type-4 sponsorship, signed batches)
├── indexer/      # @turn/indexer     — Envio HyperIndex (Envio Cloud)
├── automation/   # @turn/automation  — Chainlink CRE workflow + fallback keeper
├── web/          # @turn/web         — Next.js PWA (mera passkeys, mobile-first)
└── docs/         # economics, submission, scripts, access, architecture
```

## Environment

Copy `.env.example` to `.env` and fill in the values. `.env` is gitignored, so never commit
real keys.

## License

[MIT](./LICENSE)
