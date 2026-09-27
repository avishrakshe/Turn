"use client";
// Can this browser/device do passkeys with the PRF extension (which Turn needs)?
// Uses WebAuthn Level 3 getClientCapabilities() where available; "unknown" means we just try.
export async function prfSupport(): Promise<"yes" | "no" | "unknown"> {
  const PKC = (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential as
    | { getClientCapabilities?: () => Promise<Record<string, boolean>> }
    | undefined;
  if (!PKC) return "no";
  if (typeof PKC.getClientCapabilities === "function") {
    try {
      const caps = await PKC.getClientCapabilities();
      if ("extension:prf" in caps) return caps["extension:prf"] ? "yes" : "no";
    } catch {}
  }
  return "unknown";
}

export function passkeyErrorKind(e: unknown): "unsupported" | "cancelled" | "other" {
  const code = (e as { code?: string })?.code ?? "";
  const msg = String((e as Error)?.message ?? "");
  if (code === "PRF_UNAVAILABLE" || /PRF_UNAVAILABLE|did not return PRF/i.test(msg)) return "unsupported";
  if (/NotAllowed|cancel|abort|timed out/i.test(msg) || code === "PASSKEY_OPERATION_FAILED") return "cancelled";
  return "other";
}
