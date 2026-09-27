// Public credit API, served from the Envio index (not raw RPC).
import { getAddress, isAddress } from "viem";
import { memberProfile } from "@/lib/indexer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) return Response.json({ error: "bad address" }, { status: 400 });
  const data = await memberProfile(getAddress(address));
  const m = data.Member[0];
  if (!m) return Response.json({ address: getAddress(address), record: null });
  return Response.json({
    address: getAddress(address),
    record: {
      creditScore: m.creditScore,
      trustBps: m.trustBps,
      trustLevel: m.trustLevel,
      circlesJoined: m.circlesJoined,
      circlesCompleted: m.circlesCompleted,
      paymentsOnTime: m.paymentsOnTime,
      paymentsLate: m.paymentsLate,
      defaults: m.defaults,
      onTimeRateBps: m.onTimeRateBps,
      totalContributed: m.totalContributed,
    },
    source: "Envio HyperIndex (Turn indexer)",
  });
}
