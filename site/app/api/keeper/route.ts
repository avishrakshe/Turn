// POST { circle } -> run that circle's due action.  GET (cron) -> sweep all circles.
import { isAddress } from "viem";
import { allCircles, runDue } from "@/lib/server/keeper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { circle?: string } | null;
  if (!body?.circle || !isAddress(body.circle)) return Response.json({ error: "bad circle" }, { status: 400 });
  try {
    return Response.json(await runDue(body.circle));
  } catch (e) {
    // Someone else (CRE, another tab) may have run it first; that's fine.
    return Response.json({ action: "none", skipped: (e as Error).message.split("\n")[0] });
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const results: Record<string, unknown> = {};
  for (const c of await allCircles()) {
    try {
      results[c] = await runDue(c);
    } catch (e) {
      results[c] = { skipped: (e as Error).message.split("\n")[0] };
    }
  }
  return Response.json({ ok: true, results });
}
