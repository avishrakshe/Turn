// Verifies on a live Monad network (default: testnet 10143) that Turn's gasless design works as assumed:
//  1. a user EOA with 0 MON is delegated to TurnAccount by a relayer-sponsored type-4 tx (EIP-7702);
//  2. approve + createCircle + grantPull execute in that same tx; the user's MON balance stays 0
//     (Monad's reserve-balance rule only reverts txs that *lower* a delegated EOA's balance);
//  3. later batches need no authorization; the circle starts;
//  4. `collect` pulls contributions through the onchain grants (no allowance, no user prompt).
// Usage: pnpm --filter @turn/relayer verify-7702   (reads ../.env; needs a deployment and a funded relayer)
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  encodePacked,
  formatEther,
  http,
  keccak256,
  type Address,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { circleAbi, circleFactoryAbi, mockAUSDAbi, turnAccountAbi } from "@turn/contracts/abi";
import { loadDeployment } from "@turn/contracts/deployments";
import { createApp } from "../src/app.ts";
import { signRelayRequest, type Call } from "../src/client.ts";
import { loadConfig } from "../src/config.ts";
import { MemoryStore } from "../src/store.ts";
import { Submitter } from "../src/submit.ts";

const chainId = Number(process.env.CHAIN_ID ?? 10143);
const d = loadDeployment(chainId);
const cfg = loadConfig({ ...process.env, CHAIN_ID: String(chainId) }, d);
const chain = defineChain({
  id: chainId,
  name: "monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [cfg.rpcUrl] } },
});
const relayer = privateKeyToAccount(cfg.privateKey);
const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) }) as PublicClient;
const wallet = createWalletClient({ chain, account: relayer, transport: http(cfg.rpcUrl) });
const app = createApp({
  cfg,
  publicClient,
  submitter: new Submitter(cfg, publicClient, wallet),
  store: new MemoryStore(),
  relayerAddress: relayer.address,
});

const C = 1_000_000n; // 1 AUSD
const SECRET = keccak256(encodePacked(["string"], [`verify-${Date.now()}`]));
const log = (...a: unknown[]) => console.log(...a);

async function relay(user: ReturnType<typeof privateKeyToAccount>, calls: Call[]) {
  const info = (await (await app.request(`/v1/accounts/${user.address}`)).json()) as {
    delegated: boolean;
    nonce: string;
    eoaNonce: number;
  };
  const block = await publicClient.getBlock();
  const req = await signRelayRequest({
    signer: user,
    chainId,
    calls,
    nonce: BigInt(info.nonce),
    deadline: block.timestamp + 600n,
    delegateTo: info.delegated ? undefined : { implementation: d.accountImplementation, accountNonce: info.eoaNonce },
  });
  const res = await app.request("/v1/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = (await res.json()) as { ok: boolean; txHash?: `0x${string}`; gasUsed?: string; error?: string; detail?: string };
  if (!body.ok || !body.txHash) throw new Error(`relay failed: ${body.error} ${body.detail ?? ""}`);
  const tx = await publicClient.getTransaction({ hash: body.txHash });
  return { hash: body.txHash, gasUsed: body.gasUsed, gasLimit: tx.gas, type: tx.type, withAuthorization: !!req.authorization };
}

function joinCalls(user: Address, circle: Address, deadline: bigint, first: boolean): Call[] {
  const approve = { target: d.token, data: encodeFunctionData({ abi: mockAUSDAbi, functionName: "approve", args: [circle, C] }) };
  const grant = {
    target: user,
    data: encodeFunctionData({ abi: turnAccountAbi, functionName: "grantPull", args: [circle, C, 60, deadline] }),
  };
  const enter = first
    ? {
        target: d.factory,
        data: encodeFunctionData({
          abi: circleFactoryAbi,
          functionName: "createCircle",
          args: [
            { n: 3, contribution: C, period: 60, mode: 1, maxDiscountBps: 3000, bidWindow: 20, gracePeriod: 20, entryDeposit: C, reserveBps: 2000 },
            keccak256(encodePacked(["bytes32"], [SECRET])),
            "0x494e52",
          ],
        }),
      }
    : { target: circle, data: encodeFunctionData({ abi: circleAbi, functionName: "join", args: [SECRET, "0x414544"] }) };
  return [approve, enter, grant];
}

async function main() {
  log(`chain ${chainId}  relayer ${relayer.address}  balance ${formatEther(await publicClient.getBalance({ address: relayer.address }))} MON`);
  log(`TurnAccount implementation ${d.accountImplementation}`);
  const users = [0, 1, 2].map(() => privateKeyToAccount(generatePrivateKey()));

  if (d.mockToken) {
    for (const u of users) {
      const h = await wallet.writeContract({ address: d.token, abi: mockAUSDAbi, functionName: "faucet", args: [u.address, 10n * C] });
      await publicClient.waitForTransactionReceipt({ hash: h });
    }
    log("funded 3 fresh users with 10 mAUSD each (they hold 0 MON)");
  } else {
    throw new Error("real AUSD deployment: fund the three users with AUSD first");
  }

  const circle = await publicClient.readContract({
    address: d.factory,
    abi: circleFactoryAbi,
    functionName: "predictCircleAddress",
    args: [users[0]!.address],
  });
  const until = (await publicClient.getBlock()).timestamp + 86_400n;

  const results = [];
  for (const [i, u] of users.entries()) {
    const r = await relay(u, joinCalls(u.address, circle, until, i === 0));
    const code = await publicClient.getCode({ address: u.address });
    const bal = await publicClient.getBalance({ address: u.address });
    results.push({ user: u.address, ...r, code, monBalance: bal.toString() });
    log(`user ${i}: tx ${r.hash} type=${r.type} auth=${r.withAuthorization} gasUsed=${r.gasUsed} gasLimit=${r.gasLimit}`);
    log(`         code=${code}  MON balance=${bal}`);
    if (code?.toLowerCase() !== `0xef0100${d.accountImplementation.slice(2)}`.toLowerCase()) throw new Error("not delegated");
    if (bal !== 0n) throw new Error("user holds MON?");
  }

  // Second relay for user 0 must not need an authorization.
  const again = await relay(users[0]!, [
    { target: circle, data: encodeFunctionData({ abi: circleAbi, functionName: "setDisplayCurrency", args: ["0x494e52"] }) },
  ]);
  log(`user 0 follow-up: tx ${again.hash} type=${again.type} auth=${again.withAuthorization}`);

  const status = await publicClient.readContract({ address: circle, abi: circleAbi, functionName: "status" });
  log(`circle ${circle} status=${status} (1 = ACTIVE)`);

  const collectHash = await wallet.writeContract({ address: circle, abi: circleAbi, functionName: "collect" });
  const collect = await publicClient.waitForTransactionReceipt({ hash: collectHash });
  const paid = await Promise.all(
    users.map((u) => publicClient.readContract({ address: circle, abi: circleAbi, functionName: "payState", args: [1n, u.address] })),
  );
  log(`collect tx ${collectHash} gasUsed=${collect.gasUsed}; payState=${paid.join(",")} (1 = PAID via pull grant)`);
  if (paid.some((p) => p !== 1)) throw new Error("pull-grant collection failed");
  log("\nVERIFIED: EIP-7702 sponsorship, batched onboarding, zero-MON users, and grant-based auto-pay on this network.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
