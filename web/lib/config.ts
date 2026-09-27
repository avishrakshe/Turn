// Public, client-safe configuration. Defaults point at the Monad testnet deployment; NEXT_PUBLIC_* env vars override
// (e.g. the local anvil stack uses chain 31337 and its own addresses).
import type { Address } from "viem";
import testnet from "@turn/contracts/deployments/10143.json";

const env = (k: string) => (process.env[k] && process.env[k] !== "" ? process.env[k] : undefined);

export const config = {
  chainId: Number(env("NEXT_PUBLIC_CHAIN_ID") ?? 10143),
  rpcUrl: env("NEXT_PUBLIC_RPC_URL") ?? "https://testnet-rpc.monad.xyz",
  indexerUrl: env("NEXT_PUBLIC_INDEXER_URL") ?? "https://indexer.dev.hyperindex.xyz/f3fbca0/v1/graphql",
  explorerUrl: env("NEXT_PUBLIC_EXPLORER_URL") ?? "https://testnet.monadvision.com",
  factory: (env("NEXT_PUBLIC_FACTORY_ADDRESS") ?? testnet.factory) as Address,
  token: (env("NEXT_PUBLIC_TOKEN_ADDRESS") ?? testnet.token) as Address,
  accountImplementation: (env("NEXT_PUBLIC_ACCOUNT_IMPLEMENTATION") ?? testnet.accountImplementation) as Address,
  /** true while the token is MockAUSD (testnet): enables "Get test dollars". */
  testToken: (env("NEXT_PUBLIC_TEST_TOKEN") ?? String(testnet.mockToken)) === "true",
  /** Relayer is served by this app's own route handler unless pointed elsewhere. */
  relayerUrl: env("NEXT_PUBLIC_RELAYER_URL") ?? "/api/relayer",
  telegramBot: env("NEXT_PUBLIC_TELEGRAM_BOT") ?? "TurnCircles_bot",
  tokenDecimals: 6,
} as const;
