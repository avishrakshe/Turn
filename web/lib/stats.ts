import "server-only";
import { CHAIN } from "./site";

// Public, aggregate stats read from the Envio indexer. Never invented: if the indexer isn't
// configured or doesn't answer, the landing page says so instead of showing numbers.
//
// Contract with the indexer (indexer/schema.graphql, phase: indexer): a singleton entity
//   type GlobalStats { id: ID!  circlesActive: Int!  totalContributed: BigInt!
//                      paymentsOnTime: Int!  paymentsTotal: Int!
//                      payoutSecondsSum: BigInt!  payoutCount: Int! }
// with id "global". totalContributed is in AUSD base units (6 decimals).

export interface LiveStats {
  network: string;
  circlesActive: number;
  totalSavedUsd: number; // AUSD ≈ USD
  onTimeRate: number | null; // 0..1
  avgPayoutSeconds: number | null;
}

const QUERY = `query TurnGlobalStats { GlobalStats(where: { id: { _eq: "global" } }) {
  circlesActive totalContributed paymentsOnTime paymentsTotal payoutSecondsSum payoutCount } }`;

export async function getLiveStats(): Promise<LiveStats | null> {
  const url = process.env.NEXT_PUBLIC_INDEXER_GRAPHQL_URL;
  if (!url || !CHAIN) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { GlobalStats?: Array<Record<string, string | number>> } };
    const g = json.data?.GlobalStats?.[0];
    if (!g) return null;
    const paymentsTotal = Number(g.paymentsTotal);
    const payoutCount = Number(g.payoutCount);
    return {
      network: CHAIN.name,
      circlesActive: Number(g.circlesActive),
      totalSavedUsd: Number(BigInt(g.totalContributed as string) / 10_000n) / 100,
      onTimeRate: paymentsTotal > 0 ? Number(g.paymentsOnTime) / paymentsTotal : null,
      avgPayoutSeconds: payoutCount > 0 ? Number(g.payoutSecondsSum) / payoutCount : null,
    };
  } catch {
    return null;
  }
}
