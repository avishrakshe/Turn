"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TurnLogo } from "@/components/ring/TurnMark";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/app/hooks";
import { useT } from "@/lib/i18n";

const TABS = [
  { href: "/app", key: "nav.home", icon: "M4 11l8-7 8 7v9h-5v-6H9v6H4z" },
  { href: "/app/score", key: "nav.score", icon: "M12 3a9 9 0 100 18 9 9 0 000-18zm0 4v5l3 2" },
  { href: "/app/settings", key: "nav.settings", icon: "M12 8a4 4 0 100 8 4 4 0 000-8zM4 12h2m12 0h2M12 4v2m0 12v2M6.3 6.3l1.4 1.4m8.6 8.6l1.4 1.4m0-11.4l-1.4 1.4m-8.6 8.6l-1.4 1.4" },
];

/** The app frame: a phone-width column, a demo notice, and tab navigation once signed in. */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const signedIn = useStore((s) => s.profile !== null);
  const active = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-paper/90 border-line sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
          <Link href="/app" className="-ms-1 rounded-lg p-1" aria-label="Turn home">
            <TurnLogo />
          </Link>
          <Badge tone="warning" className="ms-1">{t("common.demoBadge")}</Badge>
          {signedIn && (
            <nav aria-label={t("nav.main")} className="ms-auto hidden sm:block">
              <ul className="flex gap-1">
                {TABS.map((tab) => (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={active(tab.href) ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-pill px-3 text-sm font-semibold",
                        active(tab.href) ? "bg-marigold-soft text-ink" : "text-ink-muted hover:text-ink",
                      )}
                    >
                      {t(tab.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
        <p className="border-line text-ink-muted border-t px-4 py-1.5 text-center text-xs">{t("common.demoBanner")}</p>
      </header>

      <main id="main" className={cn("mx-auto w-full max-w-xl flex-1 px-4 pt-6", signedIn ? "pb-28 sm:pb-12" : "pb-12")}>
        {children}
      </main>

      {signedIn && (
        <nav aria-label={t("nav.main")} className="bg-paper-raised/95 border-line fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md sm:hidden">
          <ul className="mx-auto grid max-w-xl grid-cols-3 pb-[env(safe-area-inset-bottom)]">
            {TABS.map((tab) => (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active(tab.href) ? "page" : undefined}
                  className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold", active(tab.href) ? "text-ink" : "text-ink-muted")}
                >
                  <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
                    <path d={tab.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t(tab.key)}
                  <span aria-hidden className={cn("h-1 w-6 rounded-full", active(tab.href) ? "bg-marigold" : "bg-transparent")} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
