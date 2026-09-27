// Integration test: anvil (Prague, EIP-7702) + the real Deploy script + the relayer HTTP app.
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  keccak256,
  encodePacked,
  type Address,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { circleAbi, circleFactoryAbi, mockAUSDAbi, turnAccountAbi } from "@turn/contracts/abi";
import type { Deployment } from "@turn/contracts/deployments";
import { createApp } from "../src/app.ts";
import { signRelayRequest, type Call, type RelayRequest } from "../src/client.ts";
import { loadConfig } from "../src/config.ts";
import { MemoryStore } from "../src/store.ts";
import { Submitter } from "../src/submit.ts";

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(here, "..", "..", "contracts");
const PORT = 8600 + Math.floor(Math.random() * 300);
const RPC = `http://127.0.0.1:${PORT}`;
// Anvil's well-known public test keys (never used outside local tests).
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const RELAYER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const chain = defineChain({
  id: 31337,
  name: "anvil",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let anvil: ChildProcess;
let d: Deployment;
let publicClient: PublicClient;
let app: ReturnType<typeof createApp>;
let store: MemoryStore;
const deployer = privateKeyToAccount(DEPLOYER_KEY);
const C = 100_000_000n; // 100 AUSD
const SECRET = keccak256(encodePacked(["string"], ["family-circle"]));

async function waitForRpc() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("anvil did not start");
}

function makeApp(overrides: Record<string, string> = {}) {
  const cfg = loadConfig(
    {
      RELAYER_PRIVATE_KEY: RELAYER_KEY,
      RPC_URL: RPC,
      CHAIN_ID: "31337",
      ...overrides,
    },
    d,
  );
  const relayerAccount = privateKeyToAccount(RELAYER_KEY);
  const wallet = createWalletClient({ chain, account: relayerAccount, transport: http(RPC) });
  store = new MemoryStore();
  return createApp({
    cfg,
    publicClient,
    submitter: new Submitter(cfg, publicClient, wallet),
    store,
    relayerAddress: relayerAccount.address,
  });
}

async function post(body: unknown, a = app) {
  const res = await a.request("/v1/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function accountInfo(addr: Address, a = app) {
  const res = await a.request(`/v1/accounts/${addr}`);
  return (await res.json()) as { delegated: boolean; nonce: string; eoaNonce: number };
}

/** Everything a mera passkey session would do in the app: build calls, sign batch (+ delegation once). */
async function signFor(user: ReturnType<typeof privateKeyToAccount>, calls: Call[], a = app): Promise<RelayRequest> {
  const info = await accountInfo(user.address, a);
  const block = await publicClient.getBlock();
  return signRelayRequest({
    signer: user,
    chainId: 31337,
    calls,
    nonce: BigInt(info.nonce),
    deadline: block.timestamp + 600n,
    delegateTo: info.delegated ? undefined : { implementation: d.accountImplementation, accountNonce: info.eoaNonce },
  });
}

function params(n: number) {
  return {
    n,
    contribution: C,
    period: 300,
    mode: 1,
    maxDiscountBps: 3000,
    bidWindow: 120,
    gracePeriod: 60,
    entryDeposit: C,
    reserveBps: 2000,
  } as const;
}

async function fund(user: Address) {
  const w = createWalletClient({ chain, account: deployer, transport: http(RPC) });
  const hash = await w.writeContract({
    address: d.token,
    abi: mockAUSDAbi,
    functionName: "faucet",
    args: [user, 1_000_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

beforeAll(async () => {
  anvil = spawn("anvil", ["--port", String(PORT), "--hardfork", "prague", "--silent"], { stdio: "ignore" });
  await waitForRpc();
  execFileSync("forge", ["script", "script/Deploy.s.sol", "--rpc-url", RPC, "--broadcast", "--slow"], {
    cwd: contractsDir,
    env: { ...process.env, DEPLOYER_PRIVATE_KEY: DEPLOYER_KEY },
    stdio: "ignore",
  });
  d = JSON.parse(readFileSync(join(contractsDir, "deployments", "31337.json"), "utf8"));
  publicClient = createPublicClient({ chain, transport: http(RPC) }) as PublicClient;
  app = makeApp();
}, 120_000);

afterAll(() => {
  anvil?.kill();
});

describe("relayer (EIP-7702 + sponsored batches)", () => {
  const creator = privateKeyToAccount(generatePrivateKey());
  const member = privateKeyToAccount(generatePrivateKey());
  let circle: Address;

  it("health reports the relayer and chain", async () => {
    const res = await app.request("/health");
    const body = (await res.json()) as { ok: boolean; chainId: number };
    expect(body).toMatchObject({ ok: true, chainId: 31337 });
  });

  it("first relay delegates the account and runs approve + createCircle + grantPull in one type-4 tx", async () => {
    await fund(creator.address);
    expect(await publicClient.getBalance({ address: creator.address })).toBe(0n); // never holds MON
    circle = await publicClient.readContract({
      address: d.factory,
      abi: circleFactoryAbi,
      functionName: "predictCircleAddress",
      args: [creator.address],
    });
    const block = await publicClient.getBlock();
    const calls: Call[] = [
      { target: d.token, data: encodeFunctionData({ abi: mockAUSDAbi, functionName: "approve", args: [circle, C] }) },
      {
        target: d.factory,
        data: encodeFunctionData({
          abi: circleFactoryAbi,
          functionName: "createCircle",
          args: [params(3), keccak256(encodePacked(["bytes32"], [SECRET])), "0x494e52"],
        }),
      },
      {
        target: creator.address,
        data: encodeFunctionData({
          abi: turnAccountAbi,
          functionName: "grantPull",
          args: [circle, C, 300, block.timestamp + 86_400n],
        }),
      },
    ];
    const req = await signFor(creator, calls);
    expect(req.authorization).toBeDefined();
    const { status, json } = await post(req);
    expect(status, JSON.stringify(json)).toBe(200);
    expect(json.ok).toBe(true);

    const code = await publicClient.getCode({ address: creator.address });
    expect(code?.toLowerCase()).toBe(`0xef0100${d.accountImplementation.slice(2)}`.toLowerCase());
    const members = await publicClient.readContract({ address: circle, abi: circleAbi, functionName: "members" });
    expect(members).toEqual([creator.address]);
    const grant = await publicClient.readContract({
      address: creator.address,
      abi: turnAccountAbi,
      functionName: "grantOf",
      args: [circle],
    });
    expect(grant.active).toBe(true);
    expect(await publicClient.getBalance({ address: creator.address })).toBe(0n);
  });

  it("a second member joins gaslessly; later relays need no authorization", async () => {
    await fund(member.address);
    const block = await publicClient.getBlock();
    const join: Call[] = [
      { target: d.token, data: encodeFunctionData({ abi: mockAUSDAbi, functionName: "approve", args: [circle, C] }) },
      { target: circle, data: encodeFunctionData({ abi: circleAbi, functionName: "join", args: [SECRET, "0x414544"] }) },
      {
        target: member.address,
        data: encodeFunctionData({
          abi: turnAccountAbi,
          functionName: "grantPull",
          args: [circle, C, 300, block.timestamp + 86_400n],
        }),
      },
    ];
    const r1 = await post(await signFor(member, join));
    expect(r1.status, JSON.stringify(r1.json)).toBe(200);

    const change: Call[] = [
      { target: circle, data: encodeFunctionData({ abi: circleAbi, functionName: "setDisplayCurrency", args: ["0x474250"] }) },
    ];
    const req = await signFor(member, change);
    expect(req.authorization).toBeUndefined();
    const r2 = await post(req);
    expect(r2.status, JSON.stringify(r2.json)).toBe(200);
    const info = await publicClient.readContract({ address: circle, abi: circleAbi, functionName: "memberInfo", args: [member.address] });
    expect(info.displayCurrency).toBe("0x474250");
  });

  it("rejects a call to a non-Turn contract before spending gas", async () => {
    const before = await publicClient.getTransactionCount({ address: privateKeyToAccount(RELAYER_KEY).address });
    const req = await signFor(member, [{ target: deployer.address, data: "0x" }]);
    const { status, json } = await post(req);
    expect(status).toBe(403);
    expect(json.error).toMatch(/not a Turn contract/);
    expect(await publicClient.getTransactionCount({ address: privateKeyToAccount(RELAYER_KEY).address })).toBe(before);
  });

  it("rejects self-calls other than grant management", async () => {
    const req = await signFor(member, [
      { target: member.address, data: encodeFunctionData({ abi: turnAccountAbi, functionName: "executeSelf", args: [[]] }) },
    ]);
    const { status } = await post(req);
    expect(status).toBe(403);
  });

  it("rejects a tampered batch (bad signature) via estimate, without submitting", async () => {
    const req = await signFor(member, [
      { target: circle, data: encodeFunctionData({ abi: circleAbi, functionName: "setDisplayCurrency", args: ["0x555344"] }) },
    ]);
    req.calls[0]!.data = encodeFunctionData({ abi: circleAbi, functionName: "setDisplayCurrency", args: ["0x455552"] });
    const { status, json } = await post(req);
    expect(status).toBe(422);
    expect(json.detail).toBe("BadSignature");
  });

  it("rejects expired and far-future deadlines", async () => {
    const req = await signFor(member, [
      { target: circle, data: encodeFunctionData({ abi: circleAbi, functionName: "setDisplayCurrency", args: ["0x555344"] }) },
    ]);
    const expired = { ...req, deadline: "1" };
    expect((await post(expired)).status).toBe(400);
    const far = { ...req, deadline: String(Math.floor(Date.now() / 1000) + 10 * 86_400) };
    expect((await post(far)).status).toBe(400);
  });

  it("rejects an authorization that delegates somewhere else", async () => {
    const stranger = privateKeyToAccount(generatePrivateKey());
    const req = await signFor(stranger, [
      { target: d.token, data: encodeFunctionData({ abi: mockAUSDAbi, functionName: "approve", args: [circle, 1n] }) },
    ]);
    req.authorization = { ...req.authorization!, address: deployer.address };
    const { status, json } = await post(req);
    expect(status).toBe(400);
    expect(json.error).toMatch(/Turn account implementation/);
  });

  it("requires an authorization for a brand-new account", async () => {
    const stranger = privateKeyToAccount(generatePrivateKey());
    const req = await signFor(stranger, [
      { target: d.token, data: encodeFunctionData({ abi: mockAUSDAbi, functionName: "approve", args: [circle, 1n] }) },
    ]);
    delete req.authorization;
    const { status } = await post(req);
    expect(status).toBe(400);
  });

  it("enforces the per-account daily gas budget", async () => {
    const tight = makeApp({ DAILY_GAS_PER_ACCOUNT: "50000" });
    const req = await signFor(
      member,
      [{ target: circle, data: encodeFunctionData({ abi: circleAbi, functionName: "setDisplayCurrency", args: ["0x555344"] }) }],
      tight,
    );
    const { status, json } = await post(req, tight);
    expect(status).toBe(429);
    expect(json.error).toMatch(/daily sponsored gas/);
    app = makeApp();
  });

  it("rate-limits per account", async () => {
    const limited = makeApp({ RATE_LIMIT_PER_ACCOUNT_PER_MIN: "1" });
    const req = await signFor(member, [{ target: deployer.address, data: "0x" }], limited);
    expect((await post(req, limited)).status).toBe(403); // first hit counted, rejected by policy
    expect((await post(req, limited)).status).toBe(429);
    app = makeApp();
  });

  it("the circle collects from a delegated member through the pull grant (no allowance, no prompt)", async () => {
    // third member starts the circle
    const third = privateKeyToAccount(generatePrivateKey());
    await fund(third.address);
    const block = await publicClient.getBlock();
    const join: Call[] = [
      { target: d.token, data: encodeFunctionData({ abi: mockAUSDAbi, functionName: "approve", args: [circle, C] }) },
      { target: circle, data: encodeFunctionData({ abi: circleAbi, functionName: "join", args: [SECRET, "0x555344"] }) },
      {
        target: third.address,
        data: encodeFunctionData({ abi: turnAccountAbi, functionName: "grantPull", args: [circle, C, 300, block.timestamp + 86_400n] }),
      },
    ];
    expect((await post(await signFor(third, join))).status).toBe(200);
    expect(await publicClient.readContract({ address: circle, abi: circleAbi, functionName: "status" })).toBe(1);

    // Anyone (here: the deployer acting as keeper) collects.
    const keeper = createWalletClient({ chain, account: deployer, transport: http(RPC) });
    const hash = await keeper.writeContract({ address: circle, abi: circleAbi, functionName: "collect" });
    await publicClient.waitForTransactionReceipt({ hash });
    for (const who of [creator.address, member.address, third.address]) {
      expect(await publicClient.readContract({ address: circle, abi: circleAbi, functionName: "payState", args: [1n, who] })).toBe(1);
      expect(await publicClient.readContract({ address: d.token, abi: mockAUSDAbi, functionName: "allowance", args: [who, circle] })).toBe(0n);
    }
  });
});
