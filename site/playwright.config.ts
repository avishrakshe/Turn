// End-to-end against Monad testnet: the real relayer (served by this app), the real contracts and the hosted Envio
// indexer. Needs RELAYER_PRIVATE_KEY (a testnet key holding some MON) in .env.local, and `next build` first.
// Set E2E_BASE_URL to run against a deployment instead of a local server.
import { defineConfig } from "@playwright/test";

const PORT = 3100;
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts", // not *.spec.ts, so vitest leaves these alone
  timeout: 240_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: remote ?? `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: remote
    ? undefined
    : { command: `npx next start -p ${PORT}`, url: `http://localhost:${PORT}/app`, reuseExistingServer: true, timeout: 120_000 },
});
