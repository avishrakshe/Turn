// Post-payout feedback (1–5 + one open answer), collected for docs/traction.md. No personal data required.
import { kv } from "@/lib/server/kv";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { rating?: number; answer?: string; circle?: string } | null;
  if (!b || typeof b.rating !== "number" || b.rating < 1 || b.rating > 5) return Response.json({ error: "bad request" }, { status: 400 });
  await kv().push(
    "feedback",
    JSON.stringify({ rating: Math.round(b.rating), answer: String(b.answer ?? "").slice(0, 1000), circle: b.circle ?? null, at: Date.now() }),
  );
  return Response.json({ ok: true });
}

export async function GET() {
  const items = (await kv().list("feedback", 500)).map((x) => JSON.parse(x) as { rating: number; answer: string; at: number });
  const avg = items.length ? items.reduce((s, i) => s + i.rating, 0) / items.length : null;
  return Response.json({ count: items.length, averageRating: avg, items });
}
