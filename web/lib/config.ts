// Public, client-safe configuration. Defaults point at the Monad testnet deployment; NEXT_PUBLIC_* env vars override
// (e.g. the local anvil stack uses chain 31337 and its own addresses).
// NB: Next.js only inlines NEXT_PUBLIC_* into browser code for literal `process.env.NEXT_PUBLIC_X` references,
// so each one is spelled out below (a dynamic lookup would silently fall back to the defaults in the browser).
import type { Address } from "viem";
import testnet from "@turn/contracts/deployments/10143.json";

const or = (v: string | undefined, fallback: string) => (v && v !== "" ? v : fallback);

export const config = {
  chainId: Number(or(process.env.NEXT_PUBLIC_CHAIN_ID, "10143")),
  rpcUrl: or(process.env.NEXT_PUBLIC_RPC_URL, "https://testnet-rpc.monad.xyz"),
  indexerUrl: or(process.env.NEXT_PUBLIC_INDEXER_URL, "https://indexer.dev.hyperindex.xyz/f3fbca0/v1/graphql"),
  explorerUrl: or(process.env.NEXT_PUBLIC_EXPLORER_URL, "https://testnet.monadvision.com"),
  factory: or(process.env.NEXT_PUBLIC_FACTORY_ADDRESS, testnet.factory) as Address,
  token: or(process.env.NEXT_PUBLIC_TOKEN_ADDRESS, testnet.token) as Address,
  accountImplementation: or(process.env.NEXT_PUBLIC_ACCOUNT_IMPLEMENTATION, testnet.accountImplementation) as Address,
  /** true while the token is MockAUSD (testnet): enables "Get test money". */
  testToken: or(process.env.NEXT_PUBLIC_TEST_TOKEN, String(testnet.mockToken)) === "true",
  /** Relayer is served by this app's own route handler unless pointed elsewhere. */
  relayerUrl: or(process.env.NEXT_PUBLIC_RELAYER_URL, "/api/relayer"),
  telegramBot: or(process.env.NEXT_PUBLIC_TELEGRAM_BOT, "TurnCircles_bot"),
  tokenDecimals: 6,
} as const;
