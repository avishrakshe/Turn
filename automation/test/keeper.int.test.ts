// Integration: anvil + real Deploy script.
//  1. The fallback keeper alone drives a circle from start to COMPLETED (incl. a missed payment -> markDefault).
//  2. A report built by the CRE workflow's encoder is executed by the real TurnKeeper when delivered by the
//     Chainlink forwarder address (impersonated here), and rejected from anyone else.
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  encodePacked,
  http,
  keccak256,
  type Address,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { circleAbi, circleFactoryAbi, mockAUSDAbi, turnKeeperAbi } from "@turn/contracts/abi";
import type { Deployment } from "@turn/contracts/deployments";
import { tick } from "../keeper/keeper.ts";
import { encodeJobs, planJobs } from "../shared/decide.ts";
import { snapshot } from "../keeper/snapshot.ts";

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(here, "..", "..", "contracts");
const PORT = 8900 + Math.floor(Math.random() * 90);
const RPC = `http://127.0.0.1:${PORT}`;
// anvil's well-known public test keys
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
] as const;
const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const C = 10_000_000n;
const SECRET = keccak256(encodePacked(["string"], ["keeper-test"]));

let anvil: ChildProcess;
let d: Deployment;
let client: PublicClient;
const test = () => createTestClient({ chain, mode: "anvil", transport: http(RPC) });
const walletOf = (i: number) => createWalletClient({ chain, account: privateKeyToAccount(KEYS[i]!), transport: http(RPC) });

async function waitForRpc() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("anvil did not start");
}

async function send(p: Promise<`0x${string}`>) {
  const hash = await p;
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("tx reverted");
}

/** 3-member FIXED_ORDER circle with plain EOAs (allowance-based), period 300s, grace 60s. */
async function makeCircle(): Promise<Address> {
  const members = [1, 2, 3];
  const predicted = await client.readContract({ address: d.factory, abi: circleFactoryAbi, functionName: "predictCircleAddress", args: [walletOf(1).account.address] });
  for (const i of members) {
    const w = walletOf(i);
    await send(w.writeContract({ address: d.token, abi: mockAUSDAbi, functionName: "faucet", args: [w.account.address, 1_000_000_000n] }));
    await send(w.writeContract({ address: d.token, abi: mockAUSDAbi, functionName: "approve", args: [predicted, 2n ** 255n] }));
  }
  const params = { n: 3, contribution: C, period: 300, mode: 0, maxDiscountBps: 0, bidWindow: 0, gracePeriod: 60, entryDeposit: C, reserveBps: 2000 } as const;
  await send(walletOf(1).writeContract({ address: d.factory, abi: circleFactoryAbi, functionName: "createCircle", args: [params, keccak256(encodePacked(["bytes32"], [SECRET])), "0x494e52"] }));
  for (const i of [2, 3]) {
    await send(walletOf(i).writeContract({ address: predicted, abi: circleAbi, functionName: "join", args: [SECRET, i === 2 ? "0x414544" : "0x474250"] }));
  }
  return predicted;
}

beforeAll(async () => {
  anvil = spawn("anvil", ["--port", String(PORT), "--hardfork", "prague", "--silent"], { stdio: "ignore" });
  await waitForRpc();
  execFileSync("forge", ["script", "script/Deploy.s.sol", "--rpc-url", RPC, "--broadcast"], {
    cwd: contractsDir,
    env: { ...process.env, DEPLOYER_PRIVATE_KEY: KEYS[0] },
    stdio: "ignore",
  });
  d = JSON.parse(readFileSync(join(contractsDir, "deployments", "31337.json"), "utf8"));
  client = createPublicClient({ chain, transport: http(RPC) }) as PublicClient;
}, 180_000);

afterAll(() => anvil?.kill());

describe("automation", () => {
  it("the fallback keeper alone runs a circle to completion, covering a missed payment", async () => {
    const circle = await makeCircle();
    const keeper = walletOf(0);
    const messages: string[] = [];
    // Member 3 stops paying in round 2 (their deposit covers it).
    let round2Stopped = false;
    const seen = new Set<string>();

    for (let step = 0; step < 60; step++) {
      const round = Number(await client.readContract({ address: circle, abi: circleAbi, functionName: "currentRound" }));
      if (round === 2 && !round2Stopped) {
        await send(walletOf(3).writeContract({ address: d.token, abi: mockAUSDAbi, functionName: "approve", args: [circle, 0n] }));
        round2Stopped = true;
      }
      if (round === 3 && round2Stopped) {
        await send(walletOf(3).writeContract({ address: d.token, abi: mockAUSDAbi, functionName: "approve", args: [circle, 2n ** 255n] }));
      }
      const r = await tick(client, keeper, {
        factory: d.factory,
        maxCircles: 10,
        maxJobs: 4,
        currencies: ["INR", "AED", "GBP"],
        notify: async (t) => void messages.push(t),
      });
      for (const e of r.executed) seen.add(String(e.job.action));
      if ((await client.readContract({ address: circle, abi: circleAbi, functionName: "status" })) === 2) break;
      if (r.jobs.length === 0) {
        await test().increaseTime({ seconds: 61 });
        await test().mine({ blocks: 1 });
      }
    }

    expect(await client.readContract({ address: circle, abi: circleAbi, functionName: "status" })).toBe(2); // COMPLETED
    expect([...seen].sort()).toEqual(["0", "1", "2", "3"]); // collect, close, payout, markDefault all used
    expect(messages.some((m) => m.includes("everyone still receives the full pot"))).toBe(true);
    expect(messages.some((m) => m.includes("contributions of"))).toBe(true);
  }, 120_000);

  it("TurnKeeper executes a CRE-encoded report only from the Chainlink forwarder", async () => {
    const circle = await makeCircle();
    const s = await snapshot(client, circle);
    expect(s?.nextAction).toBe(1); // COLLECT due
    const report = encodeJobs(planJobs([s!], 4).jobs);

    // Anyone else is rejected.
    await expect(
      walletOf(0).writeContract({ address: d.keeper, abi: turnKeeperAbi, functionName: "onReport", args: ["0x", report] }),
    ).rejects.toThrow();

    // The forwarder (impersonated) delivers the report; TurnKeeper runs collect on the circle.
    const forwarder = d.creForwarder;
    await test().impersonateAccount({ address: forwarder });
    await test().setBalance({ address: forwarder, value: 10n ** 18n });
    const w = createWalletClient({ chain, account: forwarder, transport: http(RPC) });
    await send(w.writeContract({ address: d.keeper, abi: turnKeeperAbi, functionName: "onReport", args: ["0x", report], gas: 3_000_000n }));
    await test().stopImpersonatingAccount({ address: forwarder });

    for (const i of [1, 2, 3]) {
      expect(await client.readContract({ address: circle, abi: circleAbi, functionName: "payState", args: [1n, walletOf(i).account.address] })).toBe(1);
    }
  }, 120_000);
});
