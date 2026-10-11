"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useHydrated } from "@/lib/app/hooks";
import { useT } from "@/lib/i18n";
import { passkeyErrorKind } from "@/lib/live/capability";
import { useSession } from "@/lib/live/session";
import { AppSkeleton } from "./AppSkeleton";
import { FaceGlyph } from "./FaceGlyph";

/**
 * For screens that need your account when this tab doesn't know it yet (first visit, wiped browser, new device).
 * One Face ID brings everything back: identity from the passkey; circles, money and history from the chain and Envio.
 */
export function SignInGate({ children }: { children: ReactNode }) {
  const t = useT();
  const hydrated = useHydrated();
  const { address, signIn, busy } = useSession();
  const [err, setErr] = useState<string | null>(null);
  if (!hydrated) return <AppSkeleton />;
  if (address) return <>{children}</>;

  async function go() {
    setErr(null);
    try {
      await signIn();
    } catch (e) {
      const kind = passkeyErrorKind(e);
      setErr(kind === "unsupported" ? t("live.noPrf") : kind === "cancelled" ? t("live.cancelled") : t("live.signInFailed"));
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <FaceGlyph scanning={busy} />
      <div>
        <h1 className="text-3xl">{t("live.welcomeBack")}</h1>
        <p className="text-ink-muted mx-auto mt-2 max-w-xs">{t("live.welcomeBackBody")}</p>
      </div>
      {err && (
        <p role="alert" className="text-danger text-sm">
          {err}
        </p>
      )}
      <Button size="lg" className="w-full" onClick={go} busy={busy}>
        {t("live.openWithFaceId")}
      </Button>
      <Link href="/app" className="text-teal-ink min-h-11 font-semibold underline-offset-4 hover:underline">
        {t("live.newToTurn")}
      </Link>
    </div>
  );
}
