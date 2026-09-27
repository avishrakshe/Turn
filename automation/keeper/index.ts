// Run the fallback keeper: `pnpm --filter @turn/automation keeper`
// Env: CHAIN_ID, RPC_URL, KEEPER_PRIVATE_KEY (falls back to RELAYER_PRIVATE_KEY), KEEPER_INTERVAL_SECONDS,
//      TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (optional notifications).
import { createPublicClient, createWalletClient, defineChain, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadDeployment } from "@turn/contracts/deployments";
import { telegramNotifier, tick } from "./keeper.ts";

const chainId = Number(process.env.CHAIN_ID ?? 10143);
const rpc = process.env.RPC_URL ?? "https://testnet-rpc.monad.xyz";
const key = (process.env.KEEPER_PRIVATE_KEY ?? process.env.RELAYER_PRIVATE_KEY) as Hex | undefined;
if (!key) throw new Error("set KEEPER_PRIVATE_KEY (or RELAYER_PRIVATE_KEY)");
const interval = Number(process.env.KEEPER_INTERVAL_SECONDS ?? 30) * 1000;
const d = loadDeployment(chainId);

const chain = defineChain({
  id: chainId,
  name: `chain-${chainId}`,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const account = privateKeyToAccount(key);
const client = createPublicClient({ chain, transport: http(rpc) }) as PublicClient;
const wallet = createWalletClient({ chain, account, transport: http(rpc) });
const tg = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID;

const opts = {
  factory: d.factory,
  maxCircles: 25,
  maxJobs: 8,
  fxUrl: "https://open.er-api.com/v6/latest/USD",
  currencies: ["INR", "AED", "GBP", "EUR", "USD"],
  notify: tg ? telegramNotifier(process.env.TELEGRAM_BOT_TOKEN!, process.env.TELEGRAM_CHAT_ID!) : undefined,
  log: (m: string) => console.log(new Date().toISOString(), m),
};

console.log(`Turn fallback keeper ${account.address} on chain ${chainId}, every ${interval / 1000}s`);
for (;;) {
  try {
    const r = await tick(client, wallet, opts);
    if (r.jobs.length === 0) console.log(new Date().toISOString(), "nothing due");
  } catch (e) {
    console.error("tick failed", e);
  }
  await new Promise((r) => setTimeout(r, interval));
}
