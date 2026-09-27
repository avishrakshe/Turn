// Deployment addresses written by `forge script script/Deploy.s.sol` (contracts/deployments/<chainId>.json).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Address } from "viem";

export type Deployment = {
  chainId: number;
  startBlock: number;
  token: Address;
  mockToken: boolean;
  circleImplementation: Address;
  factory: Address;
  registry: Address;
  accountImplementation: Address;
  keeper: Address;
  creForwarder: Address;
  owner: Address;
};

export const MONAD_TESTNET = 10143;
export const MONAD_MAINNET = 143;

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "deployments");

/** Load the deployment for a chain, or throw with a clear message if it hasn't been deployed. */
export function loadDeployment(chainId: number): Deployment {
  const file = join(dir, `${chainId}.json`);
  if (!existsSync(file)) throw new Error(`No Turn deployment for chain ${chainId} (expected ${file})`);
  return JSON.parse(readFileSync(file, "utf8")) as Deployment;
}
