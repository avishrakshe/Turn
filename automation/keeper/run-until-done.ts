// Demo/ops helper: run fallback-keeper ticks against a live network until the given circle completes.
// Usage: tsx --env-file=../.env keeper/run-until-done.ts <circle> [maxMinutes]
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { circleAbi } from "@turn/contracts/abi";
import { loadDeployment } from "@turn/contracts/deployments";
import { tick } from "./keeper.ts";

const circle = process.argv[2] as Address;
const maxMinutes = Number(process.argv[3] ?? 10);
const chainId = Number(process.env.CHAIN_ID ?? 10143);
const rpc = process.env.RPC_URL ?? "https://testnet-rpc.monad.xyz";
const key = (process.env.KEEPER_PRIVATE_KEY ?? process.env.RELAYER_PRIVATE_KEY) as Hex;
const d = loadDeployment(chainId);
const chain = defineChain({ id: chainId, name: "monad", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const client = createPublicClient({ chain, transport: http(rpc) }) as PublicClient;
const wallet = createWalletClient({ chain, account: privateKeyToAccount(key), transport: http(rpc) });
const messages: string[] = [];

const deadline = Date.now() + maxMinutes * 60_000;
while (Date.now() < deadline) {
  const status = await client.readContract({ address: circle, abi: circleAbi, functionName: "status" });
  if (status === 2) break;
  await tick(client, wallet, {
    factory: d.factory,
    maxCircles: 25,
    maxJobs: 4,
    fxUrl: "https://open.er-api.com/v6/latest/USD",
    currencies: ["INR", "AED", "GBP", "EUR", "USD"],
    notify: async (t) => void messages.push(t),
    log: (m) => console.log(new Date().toISOString(), m),
  });
  await new Promise((r) => setTimeout(r, 10_000));
}
const status = await client.readContract({ address: circle, abi: circleAbi, functionName: "status" });
console.log(`\ncircle ${circle} status=${status} (2 = COMPLETED)\n\nMessages that would go to the circle's Telegram chat:`);
for (const m of messages) console.log(` • ${m}`);
