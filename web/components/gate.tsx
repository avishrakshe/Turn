"use client";
// Shown whenever a page needs the account but there's no passkey session in memory (first visit, reload, new device).
// One Face ID rebuilds everything: identity from the passkey; circles, money and history from the chain and Envio.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useSession } from "@/lib/session";
import { Button, Notice, Screen } from "./ui";

export function RequireAccount({ children, title }: { children: ReactNode; title?: string }) {
  const { address, signIn, busy } = useSession();
  const [err, setErr] = useState<string | null>(null);
  if (address) return <>{children}</>;
  return (
    <Screen title={title} nav={false}>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="pop flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-soft text-4xl">🔐</div>
        <div>
          <h2 className="text-2xl font-extrabold">Welcome back</h2>
          <p className="mt-2 text-muted">Use Face ID or your fingerprint to open Turn. Your circles come right back, on any phone.</p>
        </div>
        {err && <Notice tone="bad">{err}</Notice>}
        <Button
          className="w-full"
          loading={busy}
          onClick={async () => {
            setErr(null);
            try {
              await signIn();
            } catch (e) {
              console.warn("[turn] sign-in failed:", (e as { code?: string }).code ?? "", (e as Error).message);
              setErr("We couldn't open Turn with that. Try again, or create a new account.");
            }
          }}
        >
          Open with Face ID
        </Button>
        <Link href="/start" className="text-sm font-semibold text-primary">
          New to Turn? Create your account
        </Link>
      </div>
    </Screen>
  );
}
