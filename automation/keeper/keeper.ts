// Fallback keeper. Same decision rule as the CRE workflow (shared/decide.ts), but it calls the permissionless
// circle functions directly instead of going through TurnKeeper + the Chainlink forwarder. Any member or
// anyone else could run it: circles never depend on a single operator.
import type { Account, Address, Chain, PublicClient, Transport, WalletClient } from "viem";
import { circleAbi } from "@turn/contracts/abi";
import { KeeperAction, messageFor, parseRates, planJobs, type Job, type Rates } from "../shared/decide.ts";
import { listCircles, snapshot } from "./snapshot.ts";

export type KeeperOptions = {
  factory: Address;
  maxCircles: number;
  maxJobs: number;
  fxUrl?: string;
  currencies: string[];
  notify?: (text: string) => Promise<void>;
  log?: (msg: string) => void;
};

export type TickResult = { jobs: Job[]; executed: { job: Job; ok: boolean; hash?: `0x${string}`; error?: string }[] };

export async function tick(
  client: PublicClient,
  wallet: WalletClient<Transport, Chain, Account>,
  opts: KeeperOptions,
): Promise<TickResult> {
  const log = opts.log ?? (() => {});
  const circles = await listCircles(client, opts.factory, opts.maxCircles);
  const snaps = [];
  for (const c of circles) {
    const s = await snapshot(client, c);
    if (s) snaps.push(s);
  }
  const { jobs, planned } = planJobs(snaps, opts.maxJobs);
  const executed: TickResult["executed"] = [];
  let rates: Rates | undefined;

  for (const [i, job] of jobs.entries()) {
    const call =
      job.action === KeeperAction.COLLECT
        ? ({ functionName: "collect", args: [] } as const)
        : job.action === KeeperAction.CLOSE_AUCTION
          ? ({ functionName: "closeAuction", args: [] } as const)
          : job.action === KeeperAction.PAYOUT
            ? ({ functionName: "payout", args: [] } as const)
            : ({ functionName: "markDefault", args: [job.member, job.round] } as const);
    try {
      // Simulate first (free); Monad bills the gas limit, so use estimate + 10%.
      const gas = await client.estimateContractGas({ address: job.circle, abi: circleAbi, ...call, account: wallet.account } as never);
      const hash = await wallet.writeContract({
        address: job.circle,
        abi: circleAbi,
        ...call,
        gas: gas + gas / 10n,
      } as never);
      const receipt = await client.waitForTransactionReceipt({ hash });
      const ok = receipt.status === "success";
      executed.push({ job, ok, hash });
      log(`${call.functionName} ${job.circle}: ${ok ? "ok" : "reverted"} ${hash}`);
      if (ok && opts.notify) {
        rates ??= await fetchRates(opts);
        const text = messageFor(planned[i]!, rates);
        if (text) await opts.notify(text);
      }
    } catch (e) {
      executed.push({ job, ok: false, error: (e as Error).message.split("\n")[0] });
      log(`${call.functionName} ${job.circle}: skipped (${(e as Error).message.split("\n")[0]})`);
    }
  }
  return { jobs, executed };
}

async function fetchRates(opts: KeeperOptions): Promise<Rates> {
  if (!opts.fxUrl) return {};
  try {
    const res = await fetch(opts.fxUrl);
    return parseRates(await res.json(), opts.currencies);
  } catch {
    return {};
  }
}

/** Telegram Bot API sendMessage (https://core.telegram.org/bots/api#sendmessage). */
export function telegramNotifier(token: string, chatId: string) {
  return async (text: string) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) throw new Error(`telegram ${res.status}`);
  };
}
