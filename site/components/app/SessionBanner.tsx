"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { passkeyErrorKind } from "@/lib/live/capability";
import { useSession } from "@/lib/live/session";

/**
 * Under the header while signed in: whether this device's signing session is open, and when it ends.
 * Open: routine actions (paying a round, small bids) go through without Face ID until the time shown.
 * Locked: you can see everything; the next action asks for Face ID.
 */
export function SessionBanner() {
  const t = useT();
  const { account, expiresAt, signIn, lock, busy } = useSession();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const left = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 1000)) : 0;
  const open = Boolean(account && left > 0);
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <div
      data-testid="session-banner"
      className={cn("border-line flex min-h-9 items-center gap-2 border-t px-4 py-1 text-xs", open ? "text-ink-muted" : "bg-paper-sunk text-ink")}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", open ? "bg-success" : "bg-ink-muted")} />
      <span className="mx-auto flex flex-wrap items-center gap-x-2 sm:mx-0 sm:flex-1">
        {open ? (
          <>
            <span>{t("live.sessionOpen")}</span>
            <span className="tabular font-semibold" aria-label={t("live.sessionEndsIn", { time: clock })}>
              {t("live.sessionEndsIn", { time: clock })}
            </span>
          </>
        ) : (
          <span>{t("live.sessionLocked")}</span>
        )}
      </span>
      {open ? (
        <button type="button" onClick={lock} className="text-teal-ink min-h-9 shrink-0 px-2 font-semibold underline-offset-4 hover:underline">
          {t("live.lockNow")}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => signIn().catch((e) => passkeyErrorKind(e) !== "cancelled" && console.warn("[turn] unlock failed:", e))}
          className="text-teal-ink min-h-9 shrink-0 px-2 font-semibold underline-offset-4 hover:underline"
        >
          {t("live.unlock")}
        </button>
      )}
    </div>
  );
}
