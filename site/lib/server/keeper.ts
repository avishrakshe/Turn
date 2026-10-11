// In-app keeper: runs whatever a circle says is due (its own `nextAction()` view), paid by the relayer key.
// Every round function is permissionless, so this has no special power: it just keeps circles moving when the
// Chainlink CRE workflow isn't deployed. Called by the app while someone views a circle, and by a cron.
import "server-only";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, type Address, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { circleAbi, circleFactoryAbi } from "@turn/contracts/abi";
import testnet from "@turn/contracts/deployments/10143.json";

const NONE = 0,
  COLLECT = 1,
  CLOSE = 2,
  DEFAULT = 3,
  PAYOUT = 4;

const g = globalThis as unknown as { __turnKeeper?: ReturnType<typeof make>; __turnKeeperLast?: Map<string, number> };

function make() {
  const chainId = Number(process.env.CHAIN_ID ?? process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
  const rpc = process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz";
  const key = (process.env.KEEPER_PRIVATE_KEY ?? process.env.RELAYER_PRIVATE_KEY) as `0x${string}` | undefined;
  if (!key) throw new Error("keeper key not configured");
  const factory = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || testnet.factory) as Address;
  const chain = defineChain({ id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  const client = createPublicClient({ chain, transport: http(rpc) }) as PublicClient;
  const wallet = createWalletClient({ chain, account: privateKeyToAccount(key), transport: http(rpc) });
  return { client, wallet, factory };
}

export type KeeperResult = { action: string; hash?: string; skipped?: string };

export async function runDue(circleRaw: string): Promise<KeeperResult> {
  g.__turnKeeper ??= make();
  g.__turnKeeperLast ??= new Map();
  const { client, wallet, factory } = g.__turnKeeper;
  const circle = getAddress(circleRaw);

  // Don't hammer: at most one action per circle every 6 seconds from this instance.
  const last = g.__turnKeeperLast.get(circle) ?? 0;
  if (Date.now() - last < 6_000) return { action: "none", skipped: "cooldown" };

  const isCircle = await client.readContract({ address: factory, abi: circleFactoryAbi, functionName: "isCircle", args: [circle] });
  if (!isCircle) return { action: "none", skipped: "not a Turn circle" };
  const [action, member] = await client.readContract({ address: circle, abi: circleAbi, functionName: "nextAction" });
  if (action === NONE) return { action: "none" };

  const call =
    action === COLLECT
      ? ({ functionName: "collect", args: [] } as const)
      : action === CLOSE
        ? ({ functionName: "closeAuction", args: [] } as const)
        : action === PAYOUT
          ? ({ functionName: "payout", args: [] } as const)
          : action === DEFAULT
            ? ({
                functionName: "markDefault",
                args: [member, BigInt(await client.readContract({ address: circle, abi: circleAbi, functionName: "currentRound" }))],
              } as const)
            : null;
  if (!call) return { action: "none" };

  g.__turnKeeperLast.set(circle, Date.now());
  // Monad bills the gas limit: estimate, then add 10%.
  const gas = await client.estimateContractGas({ address: circle, abi: circleAbi, ...call, account: wallet.account } as never);
  const hash = await wallet.writeContract({ address: circle, abi: circleAbi, ...call, gas: gas + gas / 10n } as never);
  await client.waitForTransactionReceipt({ hash });
  return { action: call.functionName, hash };
}

/** All circles the factory knows (newest last), for the cron sweep. */
export async function allCircles(max = 50): Promise<Address[]> {
  g.__turnKeeper ??= make();
  const { client, factory } = g.__turnKeeper;
  const count = Number(await client.readContract({ address: factory, abi: circleFactoryAbi, functionName: "circleCount" }));
  const out: Address[] = [];
  for (let i = Math.max(0, count - max); i < count; i++) {
    out.push(await client.readContract({ address: factory, abi: circleFactoryAbi, functionName: "allCircles", args: [BigInt(i)] }));
  }
  return out;
}
