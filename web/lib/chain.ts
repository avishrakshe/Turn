// Live onchain reads (current state only: balances, allowances, predicted addresses).
import { createPublicClient, defineChain, http, type Address, type PublicClient } from "viem";
import { circleAbi, circleFactoryAbi, mockAUSDAbi } from "@turn/contracts/abi";
import { config } from "./config";

export const chain = defineChain({
  id: config.chainId,
  name: config.chainId === 143 ? "Monad" : config.chainId === 10143 ? "Monad Testnet" : "Local",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

let client: PublicClient | undefined;
export function publicClient(): PublicClient {
  client ??= createPublicClient({ chain, transport: http(config.rpcUrl) }) as PublicClient;
  return client;
}

export async function balanceOf(account: Address): Promise<bigint> {
  return publicClient().readContract({ address: config.token, abi: mockAUSDAbi, functionName: "balanceOf", args: [account] });
}

export async function predictCircle(creator: Address): Promise<Address> {
  return publicClient().readContract({ address: config.factory, abi: circleFactoryAbi, functionName: "predictCircleAddress", args: [creator] });
}

export async function memberInfo(circle: Address, member: Address) {
  return publicClient().readContract({ address: circle, abi: circleAbi, functionName: "memberInfo", args: [member] });
}

export async function circleParams(circle: Address) {
  return publicClient().readContract({ address: circle, abi: circleAbi, functionName: "params" });
}

export async function circleInviteHash(circle: Address) {
  return publicClient().readContract({ address: circle, abi: circleAbi, functionName: "inviteHash" });
}
