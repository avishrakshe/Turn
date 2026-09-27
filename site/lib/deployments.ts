import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Contract addresses are never hard-coded in the docs. They're read at build time from the
// deploy script's output: contracts/deployments/<chainId>.json, shaped like
//   { "chainId": 10143, "network": "Monad testnet", "explorer": "https://testnet.monadvision.com",
//     "contracts": { "CircleFactory": "0x…", "CreditRegistry": "0x…", … } }

export interface Deployment {
  chainId: number;
  network: string;
  explorer: string;
  contracts: Record<string, string>;
}

const REPO_ROOT = join(process.cwd(), "..");
const DEPLOYMENTS_DIR = join(REPO_ROOT, "contracts", "deployments");

export function readDeployments(): Deployment[] {
  if (!existsSync(DEPLOYMENTS_DIR)) return [];
  return readdirSync(DEPLOYMENTS_DIR)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(DEPLOYMENTS_DIR, f), "utf8")) as Deployment)
    .sort((a, b) => a.chainId - b.chainId);
}

/** True if a repo-relative file exists, so docs only link to source that is actually published. */
// Docs pages are statically generated, so this runs at build time only; don't trace the repo.
export const repoFileExists = (path: string) => existsSync(join(/*turbopackIgnore: true*/ REPO_ROOT, path));
