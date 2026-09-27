"use client";
// Shown whenever a page needs the account but there's no passkey session (first visit on this tab, wiped browser,
// new device). One Face ID rebuilds everything: identity from the passkey; circles, money and history from the chain
// and Envio. After that, the public address is remembered for the tab so refreshes land straight on the page.
import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { passkeyErrorKind } from "@/lib/capability";
import { useSession } from "@/lib/session";
import { Icon } from "./icons";
import { PasskeyHelp } from "./passkey-help";
import { Button, Notice, Screen, Skeleton } from "./ui";

const noSubscribe = () => () => {};

export function RequireAccount({ children, title }: { children: ReactNode; title?: string }) {
  const { address, signIn, busy } = useSession();
  const [err, setErr] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  // The remembered address is only readable after hydration; until then show a neutral frame instead of flashing
  // the sign-in screen at people who are already signed in.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (address) return <>{children}</>;
  if (!hydrated)
    return (
      <Screen title={title}>
        <Skeleton className="h-44" />
        <Skeleton className="h-28" />
      </Screen>
    );

  const go = async () => {
    setErr(null);
    try {
      await signIn();
    } catch (e) {
      console.warn("[turn] sign-in failed:", (e as { code?: string }).code ?? "", (e as Error).message);
      const kind = passkeyErrorKind(e);
      if (kind === "unsupported") setHelp(true);
      else if (kind === "cancelled") setErr("No problem. Tap the button when you're ready.");
      else setErr("We couldn't open Turn with that. Try again, or create a new account.");
    }
  };

  return (
    <Screen title={title} nav={false}>
      <div className="flex flex-1 flex-col items-center justify-center gap-7 py-10 text-center">
        <div className="relative">
          <div className="absolute inset-0 -m-6 rounded-full bg-primary/10 blur-2xl" />
          <div className="pop relative flex h-24 w-24 items-center justify-center rounded-[32px] bg-gradient-to-br from-primary to-primary-deep text-primary-ink shadow-[0_18px_40px_-16px_var(--primary)]">
            <Icon name="face" size={44} strokeWidth={1.8} />
          </div>
        </div>
        <div className="rise">
          <h2 className="font-display text-[28px] font-extrabold tracking-tight">Welcome back</h2>
          <p className="mx-auto mt-2 max-w-[300px] text-muted">
            Use Face ID or your fingerprint to open Turn. Your circles come right back, on any phone.
          </p>
        </div>
        {err && <Notice tone="warn" icon="info">{err}</Notice>}
        <div className="rise-2 flex w-full flex-col gap-3">
          <Button className="w-full" icon="face" loading={busy} onClick={go}>
            Open with Face ID
          </Button>
          <Link href="/start" className="py-2 text-sm font-semibold text-primary">
            New to Turn? Create your account
          </Link>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Icon name="shield" size={14} /> No passwords. No seed phrase. Nothing stored on our servers.
        </p>
      </div>
      <PasskeyHelp open={help} onClose={() => setHelp(false)} onRetry={go} />
    </Screen>
  );
}
