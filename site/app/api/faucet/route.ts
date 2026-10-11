// POST { address } -> test AUSD for that address, on Monad testnet only. Gas is paid by the relayer key, so people
// never need MON.
//
// The money is Agora's official testnet AUSD, from Agora's public faucet (requestFunds). That faucet drips once a
// minute (FrequencyExceeded otherwise), which would make every other new account wait. So the relayer keeps a stock
// it collected from the faucet and sends each person up to GIFT from it, refilling the stock whenever the faucet
// allows. If the stock is empty, the faucet is asked to pay the person directly.
// TurnAccount only lets a user's own batch call the token, the factory and circles, which is why this is a server
// route and not part of the user's batch.
import { createPublicClient, createWalletClient, defineChain, getAddress, http, isAddress, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AGORA_TESTNET, config, faucetKind } from "@/lib/live/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Most a person gets per request, and the balance above which they get nothing more. */
const GIFT = 1_000n * 10n ** 6n;

const faucetAbi = parseAbi(["function requestFunds(address to)", "function maxAmountToOwn() view returns (uint256)"]);
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 amount) returns (bool)"]);

function clients(key: `0x${string}`) {
  const rpc = process.env.RPC_URL ?? config.rpcUrl;
  const chain = defineChain({ id: config.chainId, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  return {
    client: createPublicClient({ chain, transport: http(rpc) }),
    wallet: createWalletClient({ chain, account: privateKeyToAccount(key), transport: http(rpc) }),
  };
}

export async function POST(req: Request) {
  if (faucetKind !== "agora") return Response.json({ error: "no faucet on this network" }, { status: 404 });
  const key = process.env.RELAYER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) return Response.json({ error: "faucet not configured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { address?: string } | null;
  if (!body?.address || !isAddress(body.address)) return Response.json({ error: "bad address" }, { status: 400 });
  const to = getAddress(body.address);
  const { client, wallet } = clients(key);
  const me = wallet.account.address;
  const token = config.token;
  const faucet = AGORA_TESTNET.faucet as Address;
  const balanceOf = (a: Address) => client.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [a] });

  // Monad bills the gas limit: estimate, then add 10%.
  async function send(address: Address, abi: typeof faucetAbi | typeof erc20, functionName: string, args: unknown[]) {
    const p = { address, abi, functionName, args, account: wallet.account } as never;
    const gas = await client.estimateContractGas(p);
    const hash = await wallet.writeContract({ ...(p as object), gas: gas + gas / 10n } as never);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("transaction reverted");
    return hash;
  }
  const refill = () => send(faucet, faucetAbi, "requestFunds", [me]).catch(() => null); // at most once a minute

  const have = await balanceOf(to);
  if (have >= GIFT) return Response.json({ error: "already has enough test AUSD" }, { status: 409 });
  const amount = GIFT - have;

  try {
    let stock = await balanceOf(me);
    if (stock < amount && (await refill())) stock = await balanceOf(me);
    if (stock >= amount) {
      const txHash = await send(token, erc20, "transfer", [to, amount]);
      // Keep the stock topped up for the next person (best effort; the faucet caps how much one address holds).
      const cap = await client.readContract({ address: faucet, abi: faucetAbi, functionName: "maxAmountToOwn" });
      if (stock - amount < cap / 2n) await refill();
      return Response.json({ ok: true, txHash, amount: amount.toString(), source: "stock" });
    }
    // No stock: ask the faucet to pay the person directly.
    const txHash = await send(faucet, faucetAbi, "requestFunds", [to]);
    return Response.json({ ok: true, txHash, amount: (10_000n * 10n ** 6n).toString(), source: "faucet" });
  } catch (e) {
    const msg = (e as Error).message;
    const busy = /FrequencyExceeded/i.test(msg);
    return Response.json({ error: busy ? "The test faucet is busy. Try again in a minute." : (msg.split("\n")[0] ?? "faucet failed") }, { status: busy ? 429 : 502 });
  }
}
