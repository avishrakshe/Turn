# Turn

> **Save together. Take turns.**

Turn brings the rotating savings circle — the chit fund, tanda, susu, or committee that
millions of people already run with friends, family, and coworkers — on-chain. A group forms
a **Circle**, every member contributes a fixed amount of stablecoin each round, and each round
one member receives the pot. Who takes their turn early is decided by an auction, where members
bid a discount that is shared with everyone else, and posted collateral covers members who stop
paying. Members sign in with a passkey and never need a seed phrase or gas, and they can pay in
with a card through an on-ramp.

Built for **Metropolis — Track 2**.

## Status

🚧 Early development. This README grows as the project does. Live demo, deployed addresses,
the indexer endpoint, and videos will be listed here once they exist.

## Tech stack

| Layer | Technology |
| --- | --- |
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
├── contracts/            # @turn/contracts   — Foundry project: Circle contracts and tests
├── apps/
│   └── web/              # @turn/web         — Next.js PWA
├── services/
│   ├── indexer/          # @turn/indexer     — Envio indexer and GraphQL schema
│   ├── relayer/          # @turn/relayer     — gas-sponsoring transaction relayer
│   └── automation/       # @turn/automation  — Chainlink CRE workflows
└── docs/                 # architecture, economics, and sponsor integration notes
```

## Environment

Copy `.env.example` to `.env` and fill in the values. `.env` is gitignored, so never commit
real keys.

## License

[MIT](./LICENSE)
