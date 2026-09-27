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

## Progress

| Phase | Status |
| --- | --- |
| 1. Plan: verified facts, design, interfaces | ✅ [`docs/plan.md`](docs/plan.md) |
| 2. Contracts + full test suite | ✅ [`contracts/`](contracts/), [`docs/economics.md`](docs/economics.md), [`docs/gas.md`](docs/gas.md) |
| 3. Relayer, testnet deployment, Envio indexer | ⏳ |
| 4. Chainlink CRE automation | ⏳ |
| 5. Web app | ⏳ |
| 6. Demo, docs, submission | ⏳ |

## Deployments

**Monad testnet (10143)**. All contracts are verified on MonadVision (Sourcify). The deploy start block is `65859276`.

| Contract | Address |
| --- | --- |
| CircleFactory | [`0xA6492Ca239dDd7653525b33f16bAE7F4955F8eDb`](https://testnet.monadvision.com/address/0xA6492Ca239dDd7653525b33f16bAE7F4955F8eDb) |
| Circle (implementation) | [`0x57A61bA3AC15F8f511a7C0B3b861B23537d80668`](https://testnet.monadvision.com/address/0x57A61bA3AC15F8f511a7C0B3b861B23537d80668) |
| CreditRegistry | [`0x712d913a6fE057ae590da80941557EEbE93E9Bc0`](https://testnet.monadvision.com/address/0x712d913a6fE057ae590da80941557EEbE93E9Bc0) |
| TurnAccount (EIP-7702 delegate) | [`0x64a831694D4Eea3A08abD77303d572244c366898`](https://testnet.monadvision.com/address/0x64a831694D4Eea3A08abD77303d572244c366898) |
| TurnKeeper (Chainlink CRE receiver) | [`0x92B4984540a62278051a832C3370223244080771`](https://testnet.monadvision.com/address/0x92B4984540a62278051a832C3370223244080771) |
| MockAUSD (**test only**, until testnet AUSD) | [`0xf5f909b2d7Da364246D61C307b062844EEF86e9a`](https://testnet.monadvision.com/address/0xf5f909b2d7Da364246D61C307b062844EEF86e9a) |

The gasless design is verified live on testnet: [`docs/testnet-verification.md`](docs/testnet-verification.md).

## Local setup

Run the whole backend locally (anvil + contracts + relayer + seeded circle + Envio indexer at
http://localhost:8080): `bash scripts/local-up.sh`, and stop it with `bash scripts/local-down.sh`.

Developed in WSL2 (Ubuntu) with [Foundry](https://getfoundry.sh) ≥ 1.8, Node 24 and pnpm.

```bash
git clone --recurse-submodules https://github.com/avishrakshe/Turn.git
cd Turn/contracts
forge build
forge test                  # unit, fuzz, scenario, invariant (≈ 3 s)
forge test --gas-report
forge coverage --ir-minimum --no-match-coverage "(test|script)/"
```

## Environment

Copy `.env.example` to `.env` and fill in the values. `.env` is gitignored, so never commit
real keys.

## License

[MIT](./LICENSE)
