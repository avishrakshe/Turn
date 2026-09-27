// Time-to-first-transaction instrumentation: landing -> passkey -> confirmed join, with tap counts.
import { kv } from "@/lib/server/kv";

export const dynamic = "force-dynamic";

type Run = { id: string; startedAt: number; passkeyAt?: number; firstTxAt?: number; taps: number; flow: string };

export async function POST(req: Request) {
  const run = (await req.json().catch(() => null)) as Run | null;
  if (!run || typeof run.id !== "string" || typeof run.startedAt !== "number" || !run.firstTxAt) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const seconds = (run.firstTxAt - run.startedAt) / 1000;
  if (seconds <= 0 || seconds > 3600 || run.taps < 0 || run.taps > 200) return Response.json({ error: "out of range" }, { status: 400 });
  await kv().push("metrics:ttft", JSON.stringify({ ...run, seconds, at: Date.now() }));
  return Response.json({ ok: true });
}

export async function GET() {
  const runs = (await kv().list("metrics:ttft", 1000)).map((r) => JSON.parse(r) as Run & { seconds: number; at: number });
  const secs = runs.map((r) => r.seconds).sort((a, b) => a - b);
  const taps = runs.map((r) => r.taps).sort((a, b) => a - b);
  const median = (xs: number[]) => (xs.length ? xs[Math.floor(xs.length / 2)]! : null);
  return Response.json({ count: runs.length, medianSeconds: median(secs), medianTaps: median(taps), fastestSeconds: secs[0] ?? null, runs: runs.slice(0, 50) });
}
