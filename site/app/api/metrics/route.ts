// Time to first transaction: first visit -> passkey -> first confirmed transaction, with taps and Face ID prompts.
import { kv } from "@/lib/server/kv";

export const dynamic = "force-dynamic";

type Run = { id: string; startedAt: number; passkeyAt?: number; firstTxAt?: number; taps: number; prompts?: number; flow: string };
export type MetricsRun = Run & { seconds: number; at: number };

export async function POST(req: Request) {
  const run = (await req.json().catch(() => null)) as Run | null;
  if (!run || typeof run.id !== "string" || typeof run.startedAt !== "number" || typeof run.firstTxAt !== "number") {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const seconds = (run.firstTxAt - run.startedAt) / 1000;
  if (seconds <= 0 || seconds > 3600 || run.taps < 0 || run.taps > 200) return Response.json({ error: "out of range" }, { status: 400 });
  const clean: MetricsRun = {
    id: run.id.slice(0, 64),
    flow: String(run.flow).slice(0, 20),
    startedAt: run.startedAt,
    passkeyAt: run.passkeyAt,
    firstTxAt: run.firstTxAt,
    taps: run.taps,
    prompts: run.prompts,
    seconds,
    at: Date.now(),
  };
  await kv().push("metrics:ttft", JSON.stringify(clean));
  return Response.json({ ok: true });
}

export async function GET() {
  const runs = (await kv().list("metrics:ttft", 1000)).map((r) => JSON.parse(r) as MetricsRun);
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)]! : null;
  };
  return Response.json({
    count: runs.length,
    medianSeconds: median(runs.map((r) => r.seconds)),
    medianTaps: median(runs.map((r) => r.taps)),
    medianPrompts: median(runs.filter((r) => r.prompts != null).map((r) => r.prompts!)),
    fastestSeconds: runs.length ? Math.min(...runs.map((r) => r.seconds)) : null,
    persistent: Boolean(process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL),
    runs: runs.slice(0, 50),
  });
}
