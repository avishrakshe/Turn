import { z } from "zod";
import type { Address, Hex } from "viem";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);

const Env = z.object({
  RELAYER_PRIVATE_KEY: hex.length(66),
  RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number().int().positive(),
  RELAYER_PORT: z.coerce.number().int().default(8787),
  /** Where contracts/deployments/<chainId>.json lives is resolved by @turn/contracts; these override it. */
  FACTORY_ADDRESS: hex.length(42).optional(),
  TOKEN_ADDRESS: hex.length(42).optional(),
  ACCOUNT_IMPLEMENTATION: hex.length(42).optional(),
  /** Hard ceiling for one relayed transaction's gas limit (Monad bills the limit). docs/gas.md */
  MAX_GAS_PER_TX: z.coerce.bigint().default(1_000_000n),
  /** Per-account sponsored gas per UTC day. */
  DAILY_GAS_PER_ACCOUNT: z.coerce.bigint().default(5_000_000n),
  RATE_LIMIT_PER_IP_PER_MIN: z.coerce.number().int().default(60),
  RATE_LIMIT_PER_ACCOUNT_PER_MIN: z.coerce.number().int().default(20),
  MAX_CALLS_PER_BATCH: z.coerce.number().int().default(8),
  /** Deadlines further out than this are rejected (limits how long a signed batch stays usable). */
  MAX_DEADLINE_SECONDS: z.coerce.number().int().default(3600),
  CORS_ORIGIN: z.string().default("*"),
});

export type RelayerConfig = {
  privateKey: Hex;
  rpcUrl: string;
  chainId: number;
  port: number;
  factory: Address;
  token: Address;
  accountImplementation: Address;
  maxGasPerTx: bigint;
  dailyGasPerAccount: bigint;
  rateLimitPerIpPerMin: number;
  rateLimitPerAccountPerMin: number;
  maxCallsPerBatch: number;
  maxDeadlineSeconds: number;
  corsOrigin: string;
};

export function loadConfig(
  env: NodeJS.ProcessEnv,
  deployment?: { factory: Address; token: Address; accountImplementation: Address },
): RelayerConfig {
  const e = Env.parse(env);
  const factory = (e.FACTORY_ADDRESS ?? deployment?.factory) as Address | undefined;
  const token = (e.TOKEN_ADDRESS ?? deployment?.token) as Address | undefined;
  const accountImplementation = (e.ACCOUNT_IMPLEMENTATION ?? deployment?.accountImplementation) as
    | Address
    | undefined;
  if (!factory || !token || !accountImplementation) {
    throw new Error("Missing Turn addresses: deploy first or set FACTORY_ADDRESS/TOKEN_ADDRESS/ACCOUNT_IMPLEMENTATION");
  }
  return {
    privateKey: e.RELAYER_PRIVATE_KEY as Hex,
    rpcUrl: e.RPC_URL,
    chainId: e.CHAIN_ID,
    port: e.RELAYER_PORT,
    factory,
    token,
    accountImplementation,
    maxGasPerTx: e.MAX_GAS_PER_TX,
    dailyGasPerAccount: e.DAILY_GAS_PER_ACCOUNT,
    rateLimitPerIpPerMin: e.RATE_LIMIT_PER_IP_PER_MIN,
    rateLimitPerAccountPerMin: e.RATE_LIMIT_PER_ACCOUNT_PER_MIN,
    maxCallsPerBatch: e.MAX_CALLS_PER_BATCH,
    maxDeadlineSeconds: e.MAX_DEADLINE_SECONDS,
    corsOrigin: e.CORS_ORIGIN,
  };
}
