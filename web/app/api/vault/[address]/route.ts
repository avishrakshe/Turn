// Encrypted vault storage (passkey "vault" namespace). The server only ever sees ciphertext; writes must be signed by
// the account itself, recently, so nobody can overwrite someone else's vault or replay an old one.
import { getAddress, isAddress, recoverMessageAddress } from "viem";
import { kv } from "@/lib/server/kv";
import { vaultWriteMessage } from "@/lib/vault-message";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ address: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { address } = await params;
  if (!isAddress(address)) return Response.json({ error: "bad address" }, { status: 400 });
  const raw = await kv().get(`vault:${getAddress(address)}`);
  if (!raw) return Response.json({ sealed: null });
  return Response.json({ sealed: JSON.parse(raw) });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { address } = await params;
  if (!isAddress(address)) return Response.json({ error: "bad address" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as {
    sealed?: { v: number; nonce: string; ciphertext: string };
    timestamp?: number;
    signature?: `0x${string}`;
  } | null;
  if (!body?.sealed || !body.signature || typeof body.timestamp !== "number") {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (Math.abs(Date.now() / 1000 - body.timestamp) > 300) return Response.json({ error: "stale" }, { status: 400 });
  if (body.sealed.ciphertext.length > 200_000) return Response.json({ error: "too large" }, { status: 413 });
  const message = await vaultWriteMessage(body.sealed, body.timestamp);
  const signer = await recoverMessageAddress({ message, signature: body.signature }).catch(() => null);
  if (!signer || getAddress(signer) !== getAddress(address)) return Response.json({ error: "not your vault" }, { status: 403 });
  await kv().set(`vault:${getAddress(address)}`, JSON.stringify(body.sealed));
  return Response.json({ ok: true });
}
