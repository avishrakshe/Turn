import { serve } from "@hono/node-server";
import { createPublicClient, createWalletClient, defineChain, http, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadDeployment } from "@turn/contracts/deployments";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { MemoryStore } from "./store.ts";
import { Submitter } from "./submit.ts";

const chainId = Number(process.env.CHAIN_ID);
let deployment;
try {
  deployment = loadDeployment(chainId);
} catch {
  deployment = undefined; // addresses may come from env instead
}
const cfg = loadConfig(process.env, deployment);

const chain = defineChain({
  id: cfg.chainId,
  name: `chain-${cfg.chainId}`,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [cfg.rpcUrl] } },
});
const account = privateKeyToAccount(cfg.privateKey);
const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) }) as PublicClient;
const wallet = createWalletClient({ chain, account, transport: http(cfg.rpcUrl) });

const app = createApp({
  cfg,
  publicClient,
  submitter: new Submitter(cfg, publicClient, wallet),
  store: new MemoryStore(),
  relayerAddress: account.address,
});

serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  console.log(`Turn relayer ${account.address} on chain ${cfg.chainId}, listening on :${info.port}`);
});
