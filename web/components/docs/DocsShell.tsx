"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { TurnLogo } from "@/components/ring/TurnMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ButtonLink } from "@/components/ui/Button";
import { APP_PATH } from "@/lib/site";
import { Search } from "./Search";
import { Sidebar } from "./Sidebar";

/** Docs frame: top bar with search, a sidebar (a drawer on phones), and the page. */
export function DocsShell({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMenu(false), [pathname]);

  return (
    <>
      <a href="#doc-content" className="bg-ink text-paper sr-only z-50 rounded-lg px-4 py-3 font-semibold focus:not-sr-only focus:fixed focus:start-3 focus:top-3">
        Skip to content
      </a>
      <header className="bg-paper/90 border-line sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-4 px-5 sm:px-8">
          <Link href="/" className="-ms-1 rounded-lg p-1" aria-label="Turn home">
            <TurnLogo />
          </Link>
          <Link href="/docs" className="text-ink-muted hover:text-ink hidden min-h-11 items-center font-semibold sm:inline-flex">
            Docs
          </Link>
          <div className="ms-auto">
            <Search />
          </div>
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
          <div className="hidden md:block">
            <ButtonLink href={APP_PATH}>Start a circle</ButtonLink>
          </div>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-controls="docs-menu"
            className="hover:bg-paper-sunk -me-2 grid size-11 place-items-center rounded-full lg:hidden"
          >
            <span className="sr-only">{menu ? "Close docs menu" : "Open docs menu"}</span>
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
              {menu ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {menu && (
        <div id="docs-menu" className="bg-paper border-line fixed inset-x-0 top-16 bottom-0 z-30 overflow-y-auto border-t px-5 py-5 lg:hidden">
          <Sidebar onNavigate={() => setMenu(false)} />
          <div className="mt-4">
            <ThemeToggle />
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-[90rem] gap-10 px-5 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_14rem]">
        <aside className="hidden lg:block">
          <div className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto py-8 pe-2">
            <Sidebar />
          </div>
        </aside>
        {children}
      </div>
    </>
  );
}
