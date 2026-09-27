// The gasless relayer (@turn/relayer), served from this app's route handler so the product is one deployment.
import "server-only";
import { Hono } from "hono";
import { createPublicClient, createWalletClient, defineChain, http, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import testnet from "@turn/contracts/deployments/10143.json";
import { createApp } from "@turn/relayer/app";
import { loadConfig } from "@turn/relayer/config";
import { MemoryStore } from "@turn/relayer/store";
import { Submitter } from "@turn/relayer/submit";
import type { Address } from "viem";

const g = globalThis as unknown as { __turnRelayer?: Hono };

export function relayer(): Hono {
  if (g.__turnRelayer) return g.__turnRelayer;
  const env = process.env;
  const chainId = Number(env.CHAIN_ID ?? env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
  const deployment =
    chainId === 10143
      ? { factory: testnet.factory as Address, token: testnet.token as Address, accountImplementation: testnet.accountImplementation as Address }
      : {
          factory: env.NEXT_PUBLIC_FACTORY_ADDRESS as Address,
          token: env.NEXT_PUBLIC_TOKEN_ADDRESS as Address,
          accountImplementation: env.NEXT_PUBLIC_ACCOUNT_IMPLEMENTATION as Address,
        };
  const cfg = loadConfig(
    { ...env, CHAIN_ID: String(chainId), RPC_URL: env.RPC_URL ?? env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz" },
    deployment,
  );
  const chain = defineChain({
    id: cfg.chainId,
    name: `chain-${cfg.chainId}`,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
  const account = privateKeyToAccount(cfg.privateKey);
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) }) as PublicClient;
  const wallet = createWalletClient({ chain, account, transport: http(cfg.rpcUrl) });
  const inner = createApp({
    cfg,
    publicClient,
    submitter: new Submitter(cfg, publicClient, wallet),
    store: new MemoryStore(),
    relayerAddress: account.address,
  });
  g.__turnRelayer = new Hono().basePath("/api/relayer").route("/", inner);
  return g.__turnRelayer;
}
