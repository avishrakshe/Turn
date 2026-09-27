"use client";
// Onboarding: one Face ID. The passkey is created and the account namespace evaluated in the same ceremony.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PasskeyHelp } from "@/components/passkey-help";
import { Button, Notice, Screen } from "@/components/ui";
import { passkeyErrorKind, prfSupport } from "@/lib/capability";
import { useSession } from "@/lib/session";

function Start() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/home";
  const { create, signIn, busy, address } = useSession();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [support, setSupport] = useState<"yes" | "no" | "unknown">("unknown");

  useEffect(() => {
    if (address) router.replace(next);
  }, [address, next, router]);
  useEffect(() => {
    void prfSupport().then(setSupport);
  }, []);

  const go = async () => {
    setErr(null);
    try {
      await create(name.trim());
    } catch (e) {
      const kind = passkeyErrorKind(e);
      if (kind === "unsupported") setHelp(true);
      else if (kind === "cancelled") setErr("Face ID was cancelled. Tap to try again.");
      else setErr("Something went wrong creating your key. Please try again.");
    }
  };

  return (
    <Screen back="/" nav={false}>
      <div className="flex flex-1 flex-col gap-6 pt-4">
        <div className="relative h-24 w-24">
          <div className="absolute inset-0 -m-4 rounded-full bg-accent/20 blur-2xl" />
          <div className="pop relative flex h-24 w-24 items-center justify-center rounded-[32px] bg-gradient-to-br from-primary to-primary-deep text-primary-ink shadow-[0_18px_40px_-16px_var(--primary)]">
            <Icon name="key" size={42} strokeWidth={1.8} />
          </div>
        </div>
        <div className="rise">
          <h1 className="font-display text-[32px] font-extrabold leading-tight tracking-tight">Let&apos;s get you started</h1>
          <p className="mt-2 text-muted">Your phone&apos;s Face ID or fingerprint is your key. There&apos;s no password to remember, and nothing to write down.</p>
        </div>

        <ul className="rise-2 flex flex-col gap-2">
          {[
            { icon: "face" as const, t: "One tap to sign in, on any of your devices" },
            { icon: "bolt" as const, t: "No fees. We cover the network costs" },
            { icon: "lock" as const, t: "Only you can move your money" },
          ].map((x) => (
            <li key={x.t} className="flex items-center gap-3 text-sm font-medium">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon name={x.icon} size={16} />
              </span>
              {x.t}
            </li>
          ))}
        </ul>

        <label className="rise-3 flex flex-col gap-2">
          <span className="text-sm font-bold">What should we call you?</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Priya"
            autoComplete="given-name"
            className="min-h-14 rounded-2xl border border-line bg-surface px-4 text-base font-semibold outline-none focus:border-primary"
          />
          <span className="text-xs text-muted">Only shown on your own device when it asks for Face ID.</span>
        </label>

        {support === "no" && (
          <Notice tone="warn" icon="info">
            This browser can&apos;t make a Turn key by itself. You can still continue and use your phone to scan a QR code.
          </Notice>
        )}
        {err && (
          <Notice tone="bad" icon="info">
            {err}
          </Notice>
        )}
        <div className="mt-auto flex flex-col gap-2">
          <Button icon="face" loading={busy} onClick={go}>
            Create my account with Face ID
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setErr(null);
              try {
                await signIn();
              } catch (e) {
                if (passkeyErrorKind(e) === "unsupported") setHelp(true);
                else setErr("We couldn't find a Turn account on this device. Create one above.");
              }
            }}
          >
            I already use Turn
          </Button>
          <p className="text-center text-xs text-muted">
            By continuing you agree to use Turn with people you know.{" "}
            <Link href="/" className="underline">
              Learn more
            </Link>
          </p>
        </div>
      </div>
      <PasskeyHelp open={help} onClose={() => setHelp(false)} onRetry={go} />
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
