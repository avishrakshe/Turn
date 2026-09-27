// Node-side reads for the fallback keeper: the same snapshot the CRE workflow builds, via viem.
import type { Address, PublicClient } from "viem";
import { circleAbi, circleFactoryAbi } from "@turn/contracts/abi";
import { type CircleSnapshot, currencyCode, NextAction } from "../shared/decide.ts";

export async function listCircles(client: PublicClient, factory: Address, max: number): Promise<Address[]> {
  const count = Number(await client.readContract({ address: factory, abi: circleFactoryAbi, functionName: "circleCount" }));
  const out: Address[] = [];
  for (let i = Math.max(0, count - max); i < count; i++) {
    out.push(await client.readContract({ address: factory, abi: circleFactoryAbi, functionName: "allCircles", args: [BigInt(i)] }));
  }
  return out;
}

export async function snapshot(client: PublicClient, circle: Address): Promise<CircleSnapshot | null> {
  const c = { address: circle, abi: circleAbi } as const;
  const status = await client.readContract({ ...c, functionName: "status" });
  if (status !== 1) return null;
  const [action, member] = await client.readContract({ ...c, functionName: "nextAction" });
  if (action === NextAction.NONE) return null;
  const round = BigInt(await client.readContract({ ...c, functionName: "currentRound" }));
  const info = await client.readContract({ ...c, functionName: "roundInfo", args: [round] });
  const params = await client.readContract({ ...c, functionName: "params" });
  const addrs = await client.readContract({ ...c, functionName: "members" });
  const members = [];
  for (const a of addrs) {
    const m = await client.readContract({ ...c, functionName: "memberInfo", args: [a] });
    if (m.state === 1) members.push({ address: a, currency: currencyCode(m.displayCurrency) });
  }
  return {
    circle,
    nextAction: action,
    member,
    round,
    roundStart: BigInt(info.start),
    contribution: params.contribution,
    auction: params.mode === 1,
    bidWindow: params.bidWindow,
    settlement: info.settlement,
    members,
  };
}
