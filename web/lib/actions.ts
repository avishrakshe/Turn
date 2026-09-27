// Every user action is one EIP-712-signed batch that the relayer submits and pays for. The first one also carries
// the EIP-7702 authorization that turns the passkey EOA into a TurnAccount. The user never holds MON.
import { encodeFunctionData, keccak256, type Address, type Hex, type LocalAccount } from "viem";
import { circleAbi, circleFactoryAbi, mockAUSDAbi, turnAccountAbi } from "@turn/contracts/abi";
import { signRelayRequest, type Call, type RelayResponse } from "@turn/relayer/client";
import { config } from "./config";
import { currencyBytes3 } from "./money";

type AccountInfo = { delegated: boolean; nonce: string; eoaNonce: number; accountImplementation: Address };

async function accountInfo(address: Address): Promise<AccountInfo> {
  const res = await fetch(`${config.relayerUrl}/v1/accounts/${address}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Turn is having trouble connecting. Please try again.");
  return res.json();
}

export class ActionError extends Error {}

/** Sign (no prompt: the passkey session is in memory) and submit a batch. Resolves when it's final onchain. */
export async function run(signer: LocalAccount, calls: Call[]): Promise<{ txHash: Hex }> {
  const info = await accountInfo(signer.address);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const req = await signRelayRequest({
    signer,
    chainId: config.chainId,
    calls,
    nonce: BigInt(info.nonce),
    deadline: now + 600n,
    delegateTo: info.delegated ? undefined : { implementation: info.accountImplementation, accountNonce: info.eoaNonce },
  });
  const res = await fetch(`${config.relayerUrl}/v1/relay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = (await res.json()) as RelayResponse;
  if (!body.ok) throw new ActionError(friendly(body.error, body.detail));
  return { txHash: body.txHash };
}

/** Plain-language errors: no revert names, no hex. */
function friendly(error: string, detail?: string): string {
  const d = detail ?? "";
  if (/ERC20InsufficientBalance|transfer amount exceeds/i.test(d)) return "You don't have enough money for this yet. Add money first.";
  if (/BidTooHigh/.test(d)) return "That discount is too high for this round.";
  if (/BidNotHigher/.test(d)) return "Your new offer needs to be higher than your last one.";
  if (/TooLate/.test(d)) return "Bidding for this round has closed.";
  if (/AlreadyMember/.test(d)) return "You're already in this circle.";
  if (/WrongStatus/.test(d)) return "This circle isn't taking new members.";
  if (/BadInvite/.test(d)) return "This invite link isn't valid. Ask for a new one.";
  if (/Paused/.test(d)) return "New circles are paused for a moment. Please try again later.";
  if (/daily sponsored gas/.test(error)) return "You've done a lot today! Please try again tomorrow.";
  if (/too many requests/.test(error)) return "Slow down a little and try again in a minute.";
  return "Something went wrong. Please try again.";
}

// ---- calls -----------------------------------------------------------------------------------------------

const call = (target: Address, data: Hex): Call => ({ target, data });

export type NewCircle = {
  size: number;
  contribution: bigint;
  period: number;
  auction: boolean;
  currency: string;
  maxDiscountBps?: number;
};

export function circleParams(c: NewCircle) {
  const bidWindow = c.auction ? Math.max(20, Math.floor(c.period * 0.4)) : 0;
  return {
    n: c.size,
    contribution: c.contribution,
    period: c.period,
    mode: c.auction ? 1 : 0,
    maxDiscountBps: c.auction ? (c.maxDiscountBps ?? 3000) : 0,
    bidWindow,
    gracePeriod: Math.max(20, Math.floor(c.period * 0.2)),
    entryDeposit: c.contribution,
    reserveBps: 2000,
  } as const;
}

/** Auto-pay grant: this circle may pull at most one contribution per period, until well after it should end. */
function grant(account: Address, circle: Address, contribution: bigint, period: number, size: number): Call {
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + (size + 2) * period * 2 + 7 * 86_400);
  return call(account, encodeFunctionData({ abi: turnAccountAbi, functionName: "grantPull", args: [circle, contribution, period, validUntil] }));
}

export function createCircleCalls(account: Address, predicted: Address, c: NewCircle, inviteSecret: Hex): Call[] {
  const p = circleParams(c);
  return [
    call(config.token, encodeFunctionData({ abi: mockAUSDAbi, functionName: "approve", args: [predicted, p.entryDeposit] })),
    call(
      config.factory,
      encodeFunctionData({ abi: circleFactoryAbi, functionName: "createCircle", args: [p, keccak256(inviteSecret), currencyBytes3(c.currency)] }),
    ),
    grant(account, predicted, p.contribution, p.period, p.n),
  ];
}

export function joinCalls(
  account: Address,
  circle: Address,
  p: { contribution: bigint; entryDeposit: bigint; period: number; n: number },
  inviteSecret: Hex,
  currency: string,
): Call[] {
  return [
    call(config.token, encodeFunctionData({ abi: mockAUSDAbi, functionName: "approve", args: [circle, p.entryDeposit] })),
    call(circle, encodeFunctionData({ abi: circleAbi, functionName: "join", args: [inviteSecret, currencyBytes3(currency)] })),
    grant(account, circle, p.contribution, p.period, p.n),
  ];
}

export const bidCall = (circle: Address, bps: number) => [call(circle, encodeFunctionData({ abi: circleAbi, functionName: "bid", args: [bps] }))];
export const claimCall = (circle: Address) => [call(circle, encodeFunctionData({ abi: circleAbi, functionName: "claim" }))];
export const payNowCall = (circle: Address, member: Address) => [
  call(circle, encodeFunctionData({ abi: circleAbi, functionName: "collectFrom", args: [member] })),
];
export const currencyCall = (circle: Address, currency: string) => [
  call(circle, encodeFunctionData({ abi: circleAbi, functionName: "setDisplayCurrency", args: [currencyBytes3(currency)] })),
];
export const revokeCall = (account: Address, circle: Address) => [
  call(account, encodeFunctionData({ abi: turnAccountAbi, functionName: "revokePull", args: [circle] })),
];
export const renewCall = (account: Address, circle: Address, contribution: bigint, period: number, size: number) => [
  grant(account, circle, contribution, period, size),
];
/** Testnet only: MockAUSD's capped public faucet. */
export const testDollarsCall = (account: Address, amount: bigint) => [
  call(config.token, encodeFunctionData({ abi: mockAUSDAbi, functionName: "faucet", args: [account, amount] })),
];
export const sendCall = (to: Address, amount: bigint) => [
  call(config.token, encodeFunctionData({ abi: mockAUSDAbi, functionName: "transfer", args: [to, amount] })),
];
