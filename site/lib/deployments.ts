import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chainInfo } from "@/lib/site";

// Contract addresses are never hard-coded in the docs. They're read at build time from the
// deploy script's output, contracts/deployments/<chainId>.json, a flat record such as
//   { "chainId": 10143, "factory": "0x…", "registry": "0x…", "keeper": "0x…", "token": "0x…",
//     "mockToken": true, "circleImplementation": "0x…", "accountImplementation": "0x…", … }

export interface Deployment {
  chainId: number;
  network: string;
  explorer: string | null;
  /** Display name → address, in a fixed, readable order. */
  contracts: Array<[string, string]>;
}

type Manifest = Record<string, unknown> & { chainId: number; mockToken?: boolean };

/** Manifest keys, in display order, with the name each contract has in the source. */
const NAMES: Array<[key: string, name: (m: Manifest) => string]> = [
  ["factory", () => "CircleFactory"],
  ["circleImplementation", () => "Circle (implementation)"],
  ["registry", () => "CreditRegistry"],
  ["accountImplementation", () => "TurnAccount (EIP-7702 delegate)"],
  ["keeper", () => "TurnKeeper"],
  ["token", (m) => (m.mockToken ? "MockAUSD (test token)" : "AUSD")],
  ["creForwarder", () => "Chainlink CRE forwarder"],
];

const REPO_ROOT = join(process.cwd(), "..");
const DEPLOYMENTS_DIR = join(REPO_ROOT, "contracts", "deployments");

function toDeployment(m: Manifest): Deployment {
  const chain = chainInfo(m.chainId);
  const contracts = NAMES.flatMap(([key, name]) =>
    typeof m[key] === "string" && /^0x[0-9a-fA-F]{40}$/.test(m[key] as string) ? [[name(m), m[key] as string] as [string, string]] : [],
  );
  return { chainId: m.chainId, network: chain?.name ?? `Chain ${m.chainId}`, explorer: chain?.explorer ?? null, contracts };
}

export function readDeployments(): Deployment[] {
  if (!existsSync(DEPLOYMENTS_DIR)) return [];
  return readdirSync(DEPLOYMENTS_DIR)
    .filter((f) => /^\d+\.json$/.test(f) && f !== "31337.json") // 31337 is the local anvil chain
    .map((f) => toDeployment(JSON.parse(readFileSync(join(DEPLOYMENTS_DIR, f), "utf8")) as Manifest))
    .filter((d) => d.contracts.length > 0)
    .sort((a, b) => a.chainId - b.chainId);
}

/** True if a repo-relative file exists, so docs only link to source that is actually published. */
// Docs pages are statically generated, so this runs at build time only; don't trace the repo.
export const repoFileExists = (path: string) => existsSync(join(/*turbopackIgnore: true*/ REPO_ROOT, path));
