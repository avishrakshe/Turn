"use client";
// Onboarding: one Face ID. The passkey is created and the account namespace evaluated in the same ceremony.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button, Notice, Screen } from "@/components/ui";
import { useSession } from "@/lib/session";

function Start() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/home";
  const { create, signIn, busy, address } = useSession();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (address) router.replace(next);
  }, [address, next, router]);

  return (
    <Screen back="/" nav={false}>
      <div className="flex flex-1 flex-col gap-6 pt-6">
        <div className="pop flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-soft text-4xl">🙂</div>
        <div>
          <h1 className="text-3xl font-extrabold">Let's get you started</h1>
          <p className="mt-2 text-muted">Your phone's Face ID or fingerprint is your key. There's no password to remember, and nothing to write down.</p>
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">What should we call you?</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Priya"
            autoComplete="given-name"
            className="min-h-12 rounded-2xl border border-line bg-surface px-4 text-base outline-none focus:border-primary"
          />
          <span className="text-xs text-muted">Only shown on your own device when it asks for Face ID.</span>
        </label>
        {err && <Notice tone="bad">{err}</Notice>}
        <div className="mt-auto flex flex-col gap-3">
          <Button
            loading={busy}
            onClick={async () => {
              setErr(null);
              try {
                await create(name.trim());
              } catch (e) {
                const msg = String((e as Error)?.message ?? "");
                setErr(
                  /PRF_UNAVAILABLE/.test(msg)
                    ? "This phone's passkeys can't be used for Turn yet. Try Chrome or Safari on an up-to-date phone."
                    : "Face ID was cancelled. Tap to try again.",
                );
              }
            }}
          >
            Create my account with Face ID
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setErr(null);
              try {
                await signIn();
              } catch {
                setErr("We couldn't find a Turn account on this phone. Create one above.");
              }
            }}
          >
            I already use Turn
          </Button>
          <p className="text-center text-xs text-muted">
            By continuing you agree to use Turn with people you know. <Link href="/" className="underline">Learn more</Link>
          </p>
        </div>
      </div>
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Start />
    </Suspense>
  );
}
