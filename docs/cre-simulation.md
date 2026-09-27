# Chainlink CRE: recorded simulation on Monad testnet (2026-09-27)

Workflow: [`automation/cre/turn-keeper`](../automation/cre/turn-keeper) · CRE CLI v1.35.0 · `@chainlink/cre-sdk` 1.22.0
Command: `cre workflow simulate turn-keeper --target demo-settings --broadcast` (from `automation/cre`)

Each run: **cron trigger → read Monad (factory → circles → `nextAction`) → decide → consensus-signed report →
Chainlink forwarder → `TurnKeeper.onReport` → circle action → FX API (median across nodes) → Telegram message.**
The circle is `0xEa27…0feB` (3 zero-MON members onboarded gaslessly via EIP-7702, 60-second rounds).

| Run | Due action | Report gas limit | Onchain (forwarder → TurnKeeper → Circle) | Telegram |
| --- | --- | --- | --- | --- |
| 1 | round 1 close auction | 6,000,000 (flat; replaced by sizing) | [`0xeb8f1aec…`](https://testnet.monadvision.com/tx/0xeb8f1aec06b29861ef7fb980f22722ddf205813f4b074169e78f039a33e8dfa7) | off |
| 2 | round 1 payout | 650,000 | [`0x362859a5…`](https://testnet.monadvision.com/tx/0x362859a599098240d9e0177c4aaf917dfc3a555069dd44ae913e782406b1679d) | off |
| 3 | round 2 collect (auto-pay grants) | 1,060,000 | [`0xdb08c1f4…`](https://testnet.monadvision.com/tx/0xdb08c1f475a89365e6794b50ed40edcc8eaa8f830f900894d011d4c3deb53073) | off |
| 4 | round 2 close auction | 400,000 | [`0x27eef17d…`](https://testnet.monadvision.com/tx/0x27eef17d40cb2a5b344f0db071e2105b82adc9bcc4abf1518ae09025d3fb2928) | off |
| 5 | round 2 payout | 650,000 | [`0xddaa9b5f…`](https://testnet.monadvision.com/tx/0xddaa9b5ffa15f99d12de0090531b5e939a7981bef05e48bbd58f408c5dd49d39) | ✅ 200 |
| 6 | round 3 collect (auto-pay grants) | 1,060,000 | [`0xf7079cdd…`](https://testnet.monadvision.com/tx/0xf7079cdda17181a70da8e222e8bb154b8a8f595ec4053cf22b3b80006380d494) | ✅ 200 |

Verified onchain after run 1: the transaction targets the CRE simulation forwarder `0xB9F7…D192`, whose call
emitted `TurnKeeper.JobExecuted` followed by `Circle.AuctionClosed`. After run 2, round 1 has `paidOut = true` and the circle advanced to round 2.

## Log of run 6 (as recorded)

```
[USER LOG] scanned 2 circle(s); 1 with a due action
[USER LOG] due: 0xEa27f151E1DAa4FB717e74Fa5552Aa4836cA0feB round 3 action 1
[USER LOG] TurnKeeper report executed 1 job(s) with gas limit 1060000: 0xf7079cdda17181a70da8e222e8bb154b8a8f595ec4053cf22b3b80006380d494
[USER LOG] FX (median across nodes, per USD): {"INR":95.878915,"AED":3.6725,"GBP":0.755093,"EUR":0.877506}
[USER LOG] message: 🔔 your circle, round 3: contributions of ₹96 · AED 3.67 were collected by auto-pay. Bidding for this round's pot (₹288 · AED 11.02) is open for the next 20 seconds.
[USER LOG] telegram 200
✓ Workflow Simulation Result: "executed 1 job(s): 0xf7079cdd…; 1 notification(s) sent"
```

## What we learned on Monad

- **Gas limit is billed in full.** A flat 6M report limit cost about 0.6 MON per run, so the workflow now sizes the limit
  from its jobs (`reportGasLimit` in `shared/decide.ts`): 400k to close an auction, 650k for a payout, about 1.06M to collect from 3 members.
- **Consensus aggregators:** per-field `median` for FX. Aggregators are passed as functions, as in Chainlink's templates.
- **POSTs use `cacheSettings`**, so a real DON sends each Telegram message once, not once per node.
- **Deployment to a DON:** the account currently has simulation access ("Deploy Access: Not enabled"). Deploying
  needs `cre account access`, plus `TurnKeeper.setForwarder(0xF8344CFd5c43616a4366C34E3EEE75af79a74482)` (testnet
  production forwarder) from the contract owner.
