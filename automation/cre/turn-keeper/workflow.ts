// Turn keeper — Chainlink CRE workflow.
//
//   cron ──► read every recent circle on Monad (factory.allCircles, circle.nextAction)
//        ──► plan due round actions (shared/decide.ts, same rule as the fallback keeper)
//        ──► one signed report to TurnKeeper.onReport ──► collect / closeAuction / payout / markDefault
//        ──► FX rates (open.er-api.com, median across nodes) ──► Telegram: plain-language updates in each
//            member's currency (₹ / AED / £ …)
//
// Every round function is permissionless, so the workflow holds no special power: it only makes circles run
// on time, and TurnKeeper accepts reports only from the Chainlink forwarder.
import {
  bytesToHex,
  ConsensusAggregationByFields,
  consensusIdenticalAggregation,
  cre,
  encodeCallMsg,
  getNetwork,
  hexToBase64,
  type HTTPSendRequester,
  json,
  LAST_FINALIZED_BLOCK_NUMBER,
  median,
  ok,
  prepareReportRequest,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import { type Abi, type Address, decodeFunctionResult, encodeFunctionData, toHex, zeroAddress } from "viem";
import { z } from "zod";
import { circleAbi, circleFactoryAbi } from "../../../contracts/ts/abi";
import {
  type CircleSnapshot,
  currencyCode,
  encodeJobs,
  messageFor,
  NextAction,
  parseRates,
  planJobs,
  type Rates,
  reportGasLimit,
} from "../../shared/decide";

export const configSchema = z.object({
  schedule: z.string(),
  chainSelectorName: z.string(),
  isTestnet: z.boolean(),
  factory: z.string(),
  keeper: z.string(),
  /** Only the newest N circles are scanned each tick. */
  maxCircles: z.number().int().positive(),
  /** Jobs per report (each circle action is a separate call inside TurnKeeper). */
  maxJobs: z.number().int().positive(),
  gasLimit: z.string(),
  fxUrl: z.string(),
  currencies: z.array(z.string()),
  /** Telegram chat that receives circle updates; empty disables notifications. */
  telegramChatId: z.string(),
});
type Config = z.infer<typeof configSchema>;

const CircleStatusActive = 1;

function read<T>(
  runtime: Runtime<Config>,
  evm: InstanceType<typeof cre.capabilities.EVMClient>,
  to: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
): T {
  const data = encodeFunctionData({ abi, functionName, args } as never);
  const reply = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to, data }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  return decodeFunctionResult({ abi, functionName, data: bytesToHex(reply.data) } as never) as T;
}

function snapshot(runtime: Runtime<Config>, evm: InstanceType<typeof cre.capabilities.EVMClient>, circle: Address) {
  const abi = circleAbi as Abi;
  const status = read<number>(runtime, evm, circle, abi, "status");
  if (Number(status) !== CircleStatusActive) return null;
  const [action, member] = read<[number, Address]>(runtime, evm, circle, abi, "nextAction");
  if (Number(action) === NextAction.NONE) return null;

  const round = BigInt(read<number | bigint>(runtime, evm, circle, abi, "currentRound"));
  const info = read<{ start: bigint; settlement: boolean }>(runtime, evm, circle, abi, "roundInfo", [round]);
  const params = read<{ contribution: bigint; mode: number; bidWindow: number }>(runtime, evm, circle, abi, "params");
  const addrs = read<readonly Address[]>(runtime, evm, circle, abi, "members");
  const members = addrs.map((a) => {
    const m = read<{ state: number; displayCurrency: string }>(runtime, evm, circle, abi, "memberInfo", [a]);
    return { address: a, currency: currencyCode(m.displayCurrency), active: Number(m.state) === 1 };
  });
  const s: CircleSnapshot = {
    circle,
    nextAction: Number(action),
    member,
    round,
    roundStart: BigInt(info.start),
    contribution: BigInt(params.contribution),
    auction: Number(params.mode) === 1,
    bidWindow: Number(params.bidWindow),
    settlement: info.settlement,
    members: members.filter((m) => m.active).map(({ address, currency }) => ({ address, currency })),
  };
  return s;
}

// ---- external APIs (run on each node, then aggregated) ------------------------------------------------

const fetchRates = (sender: HTTPSendRequester, config: Config): Rates => {
  const res = sender.sendRequest({ url: config.fxUrl, method: "GET" }).result();
  if (!ok(res)) throw new Error(`FX API returned ${res.statusCode}`);
  const rates = parseRates(json(res), config.currencies);
  for (const c of config.currencies) if (c !== "USD" && rates[c] === undefined) throw new Error(`FX: no rate for ${c}`);
  return rates;
};

const sendTelegram = (sender: HTTPSendRequester, token: string, chatId: string, text: string): number => {
  const body = hexToBase64(toHex(JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })));
  const res = sender
    .sendRequest({
      url: `https://api.telegram.org/bot${token}/sendMessage`,
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      // POSTs must be cached so every node in the DON doesn't send its own copy.
      cacheSettings: { store: true, maxAge: "60s" },
    })
    .result();
  return res.statusCode;
};

// ---- handler --------------------------------------------------------------------------------------------

export const onCronTrigger = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainSelectorName, isTestnet: cfg.isTestnet });
  if (!network) throw new Error(`Network not found: ${cfg.chainSelectorName}`);
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const factory = cfg.factory as Address;

  // 1. Read: newest circles first-scanned, oldest-first planned.
  const count = Number(read<bigint>(runtime, evm, factory, circleFactoryAbi as Abi, "circleCount"));
  const from = Math.max(0, count - cfg.maxCircles);
  const snapshots: CircleSnapshot[] = [];
  for (let i = from; i < count; i++) {
    const circle = read<Address>(runtime, evm, factory, circleFactoryAbi as Abi, "allCircles", [BigInt(i)]);
    const s = snapshot(runtime, evm, circle);
    if (s) snapshots.push(s);
  }
  runtime.log(`scanned ${count - from} circle(s); ${snapshots.length} with a due action`);

  // 2. Decide.
  const { jobs, planned } = planJobs(snapshots, cfg.maxJobs);
  if (jobs.length === 0) return "idle: nothing due";
  for (const s of planned) runtime.log(`due: ${s.circle} round ${s.round} action ${s.nextAction}`);

  // 3. Act: one consensus-signed report, executed by TurnKeeper through the Chainlink forwarder.
  const report = runtime.report(prepareReportRequest(encodeJobs(jobs))).result();
  // Monad bills the gas limit, so size it from the planned jobs (config value is only the ceiling).
  const gasLimit = reportGasLimit(planned, BigInt(cfg.gasLimit)).toString();
  const write = evm
    .writeReport(runtime, { receiver: cfg.keeper, report, gasConfig: { gasLimit } })
    .result();
  if (write.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`keeper report failed: ${write.errorMessage || write.txStatus}`);
  }
  const txHash = bytesToHex(write.txHash ?? new Uint8Array(32));
  runtime.log(`TurnKeeper report executed ${jobs.length} job(s) with gas limit ${gasLimit}: ${txHash}`);

  // 4. Tell people, in their own currency. Notifications never block the round actions above.
  //    FX rates come from an external API, aggregated by median across nodes.
  const http = new cre.capabilities.HTTPClient();
  // Field aggregators are passed as functions (as in Chainlink's templates), not called.
  const fields = Object.fromEntries(cfg.currencies.filter((c) => c !== "USD").map((c) => [c, median]));
  let rates: Rates = {};
  try {
    rates = http
      .sendRequest(runtime, fetchRates, ConsensusAggregationByFields<Rates>(fields as never))(cfg)
      .result();
    runtime.log(`FX (median across nodes, per USD): ${JSON.stringify(rates)}`);
  } catch (e) {
    runtime.log(`FX unavailable, amounts shown in USD: ${String(e)}`);
  }
  const texts = planned.map((s) => messageFor(s, rates)).filter((t): t is string => t !== null);
  for (const t of texts) runtime.log(`message: ${t}`);

  if (cfg.telegramChatId === "") return `executed ${jobs.length} job(s): ${txHash}; notifications off`;
  let token: string;
  try {
    token = runtime.getSecret({ id: "TELEGRAM_BOT_TOKEN" }).result().value;
  } catch {
    runtime.log("TELEGRAM_BOT_TOKEN not set; skipping notifications");
    return `executed ${jobs.length} job(s): ${txHash}`;
  }
  let sent = 0;
  for (const text of texts) {
    const status = http
      .sendRequest(runtime, sendTelegram, consensusIdenticalAggregation<number>())(token, cfg.telegramChatId, text)
      .result();
    runtime.log(`telegram ${status}`);
    if (status >= 200 && status < 300) sent++;
  }
  return `executed ${jobs.length} job(s): ${txHash}; ${sent} notification(s) sent`;
};

export function initWorkflow(config: Config) {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
}
