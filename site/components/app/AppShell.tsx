"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { TurnLogo } from "@/components/ring/TurnMark";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/app/hooks";
import { useT } from "@/lib/i18n";
import { cachePage } from "@/lib/pwa";
import { WalletButton } from "./Wallet";

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const TABS: Array<{ href: string; key: string; icon: ReactNode }> = [
  {
    href: "/app",
    key: "nav.home",
    icon: <path {...icon} d="M3.5 10.5L12 3.5l8.5 7V20a1 1 0 01-1 1h-4.5v-6h-6v6H4.5a1 1 0 01-1-1z" />,
  },
  {
    href: "/app/score",
    key: "nav.score",
    // A gauge: the Turn Score is a reading, not a clock.
    icon: (
      <>
        <path {...icon} d="M3.3 18.5a10 10 0 1117.4 0" />
        <path {...icon} d="M12 14l4.2-4.2" />
        <circle cx="12" cy="14" r="1.6" fill="currentColor" />
      </>
    ),
  },
  {
    href: "/app/settings",
    key: "nav.settings",
    icon: (
      <>
        <path
          {...icon}
          d="M10.3 3.3a1.7 1.7 0 013.4 0l.2 1.2a7.5 7.5 0 012 1.2l1.2-.4a1.7 1.7 0 012 .8 1.7 1.7 0 01-.4 2.2l-.9.8a7.5 7.5 0 010 2.3l.9.8a1.7 1.7 0 01.4 2.2 1.7 1.7 0 01-2 .8l-1.2-.4a7.5 7.5 0 01-2 1.2l-.2 1.2a1.7 1.7 0 01-3.4 0l-.2-1.2a7.5 7.5 0 01-2-1.2l-1.2.4a1.7 1.7 0 01-2-.8 1.7 1.7 0 01.4-2.2l.9-.8a7.5 7.5 0 010-2.3l-.9-.8a1.7 1.7 0 01-.4-2.2 1.7 1.7 0 012-.8l1.2.4a7.5 7.5 0 012-1.2z"
        />
        <circle {...icon} cx="12" cy="10.2" r="2.8" />
      </>
    ),
  },
];

/**
 * The app frame: a phone-width column and tab navigation once signed in. First-contact
 * screens (welcome, joining) spell out that this is a demo; after that the Demo badge stays
 * in the header and opens the same explanation.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const signedIn = useStore((s) => s.profile !== null);
  const [about, setAbout] = useState(false);
  const active = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
  useEffect(() => cachePage(pathname), [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-paper/85 border-line sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
          <Link href="/app" className="-ms-1 rounded-lg p-1" aria-label={t("nav.brandHome")}>
            <TurnLogo />
          </Link>
          <button
            type="button"
            onClick={() => setAbout(true)}
            aria-haspopup="dialog"
            className="bg-warning-soft text-warning ms-1 inline-flex min-h-8 items-center gap-1.5 rounded-pill px-2.5 text-xs font-semibold"
          >
            <span aria-hidden className="bg-warning size-1.5 rounded-full" />
            {t("common.demoBadge")}
          </button>
          <div className="ms-auto flex items-center gap-2">
          {signedIn && (
            <nav aria-label={t("nav.main")} className="hidden sm:block">
              <ul className="flex gap-1">
                {TABS.map((tab) => (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={active(tab.href) ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-pill px-3.5 text-sm font-semibold",
                        active(tab.href) ? "bg-marigold-soft text-ink" : "text-ink-muted hover:text-ink",
                      )}
                    >
                      <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
                        {tab.icon}
                      </svg>
                      {t(tab.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <WalletButton />
          </div>
        </div>
        {!signedIn &&<p className="border-line text-ink-muted border-t px-4 py-1.5 text-center text-xs">{t("common.demoBanner")}</p>}
      </header>

      <main id="main" className={cn("mx-auto w-full max-w-xl flex-1 px-4 pt-6", signedIn ? "pb-32 sm:pb-12" : "pb-12")}>
        {children}
      </main>

      {signedIn && (
        <nav aria-label={t("nav.main")} className="bg-paper-raised/90 border-line fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md sm:hidden">
          <ul className="mx-auto grid max-w-xl grid-cols-3 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {TABS.map((tab) => {
              const on = active(tab.href);
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={on ? "page" : undefined}
                    className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-semibold", on ? "text-ink" : "text-ink-muted")}
                  >
                    <span
                      className={cn(
                        "grid h-8 w-14 place-items-center rounded-pill transition-colors duration-(--duration-base)",
                        on ? "bg-marigold-soft text-marigold-ink" : "",
                      )}
                    >
                      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
                        {tab.icon}
                      </svg>
                    </span>
                    {t(tab.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <Sheet open={about} onClose={() => setAbout(false)} title={t("common.demoBadge")}>
        <p className="pb-6">{t("common.demoBanner")}</p>
      </Sheet>
    </div>
  );
}
