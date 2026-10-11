"use client";
// Live data: balances from RPC, everything else from the Envio indexer. Polled, because Monad confirms in about a
// second and the indexer follows within a few.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { balanceOf } from "./chain";
import { circleDetail, memberProfile, myCircles, myTransfers, sessions } from "./indexer";
import { useSession } from "./session";

export function useBalance() {
  const { address } = useSession();
  return useQuery({ queryKey: ["balance", address], queryFn: () => balanceOf(address as Address), enabled: Boolean(address), refetchInterval: 4_000 });
}

export function useMyCircles() {
  const { address } = useSession();
  return useQuery({ queryKey: ["my", address], queryFn: () => myCircles(address as Address), enabled: Boolean(address), refetchInterval: 4_000 });
}

/** Auto-pay grants (TurnAccount pull permissions), one per circle. */
export function useGrants() {
  const { address } = useSession();
  return useQuery({ queryKey: ["grants", address], queryFn: () => sessions(address as Address), enabled: Boolean(address), refetchInterval: 8_000 });
}

/** Money sent to and received from other people (from the indexer's Transfer entity). */
export function useTransfers() {
  const { address } = useSession();
  return useQuery({ queryKey: ["transfers", address], queryFn: () => myTransfers(address as Address), enabled: Boolean(address), refetchInterval: 4_000 });
}

export function useCircle(circle: Address) {
  return useQuery({ queryKey: ["circle", circle], queryFn: () => circleDetail(circle), refetchInterval: 2_000 });
}

export function useProfile(address: Address | null) {
  return useQuery({ queryKey: ["profile", address], queryFn: () => memberProfile(address as Address), enabled: Boolean(address), refetchInterval: 8_000 });
}

/** Seconds since epoch, re-rendering every `intervalMs` (for countdowns). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
