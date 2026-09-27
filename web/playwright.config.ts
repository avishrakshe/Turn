// E2E against the local stack (scripts/local-up.sh: anvil 31337 + Envio indexer on :8080).
import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dep = JSON.parse(readFileSync(join(here, "..", "contracts", "deployments", "31337.json"), "utf8"));
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_CHAIN_ID: "31337",
      NEXT_PUBLIC_RPC_URL: "http://127.0.0.1:8545",
      NEXT_PUBLIC_INDEXER_URL: "http://localhost:8080/v1/graphql",
      NEXT_PUBLIC_FACTORY_ADDRESS: dep.factory,
      NEXT_PUBLIC_TOKEN_ADDRESS: dep.token,
      NEXT_PUBLIC_ACCOUNT_IMPLEMENTATION: dep.accountImplementation,
      NEXT_PUBLIC_TEST_TOKEN: "true",
      CHAIN_ID: "31337",
      RPC_URL: "http://127.0.0.1:8545",
      // anvil's public test key #2 (local only), separate from the local-up relayer's key
      RELAYER_PRIVATE_KEY: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    },
  },
});
