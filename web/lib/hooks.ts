"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { balanceOf } from "./chain";
import { myCircles } from "./indexer";
import { useSession } from "./session";

export function useBalance() {
  const { address } = useSession();
  return useQuery({
    queryKey: ["balance", address],
    queryFn: () => balanceOf(address as Address),
    enabled: Boolean(address),
    refetchInterval: 4_000,
  });
}

export function useMyCircles() {
  const { address } = useSession();
  return useQuery({
    queryKey: ["my", address],
    queryFn: () => myCircles(address as Address),
    enabled: Boolean(address),
    refetchInterval: 4_000,
  });
}

/** Seconds since epoch, re-rendering every second (for countdowns). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function countdown(seconds: number): string {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}
