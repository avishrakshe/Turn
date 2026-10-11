"use client";
// Test money on testnet, so a new account can pay its first deposit. Two sources, depending on the token:
// - MockAUSD: its public mint goes into the user's own batch (one transaction, nothing extra).
// - Agora's official testnet AUSD: the server asks Agora's faucet (paid by the relayer), then we wait for the balance.
import type { Address } from "viem";
import type { Call } from "@turn/relayer/client";
import { testDollarsCall } from "./actions";
import { balanceOf } from "./chain";
import { faucetKind } from "./config";

const MOCK_CAP = 1_000n * 10n ** 6n;

export class FaucetError extends Error {}

/** Ask Agora's testnet faucet for test AUSD. Resolves with the faucet transaction once it's confirmed. */
export async function requestTestAusd(address: Address): Promise<{ txHash: string; amount: bigint }> {
  const res = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
  const body = (await res.json()) as { ok?: boolean; txHash?: string; amount?: string; error?: string };
  if (!res.ok || !body.txHash) throw new FaucetError(body.error ?? "faucet failed");
  return { txHash: body.txHash, amount: BigInt(body.amount ?? "0") };
}

/**
 * Make sure `address` can pay `needed`. Returns calls to put at the front of the user's batch (MockAUSD), or tops up
 * through Agora's faucet first and waits until the balance shows it. Does nothing on mainnet.
 */
export async function topUpFor(address: Address, needed: bigint): Promise<Call[]> {
  if (!faucetKind) return [];
  const balance = await balanceOf(address);
  if (balance >= needed) return [];
  if (faucetKind === "mock") return testDollarsCall(address, needed * 3n > MOCK_CAP ? MOCK_CAP : needed * 3n);
  await requestTestAusd(address);
  for (let i = 0; i < 20 && (await balanceOf(address)) < needed; i++) await new Promise((r) => setTimeout(r, 750));
  return [];
}
