"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { TurnLogo } from "@/components/ring/TurnMark";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { APP_PATH, GET_APP_PATH } from "@/lib/site";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#safety", label: "Safety" },
  { href: "/#score", label: "Turn Score" },
  { href: "/docs", label: "Docs" },
  { href: "/#faq", label: "FAQ" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuId = useId();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,border-color] duration-(--duration-base)",
        scrolled || open ? "bg-paper/90 border-line border-b backdrop-blur-md" : "border-b border-transparent",
      )}
    >
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link href="/" className="-ms-1 rounded-lg p-1" aria-label="Turn home">
          <TurnLogo />
        </Link>
        <ul className="ms-auto hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center rounded-lg px-3 text-[0.95rem] font-medium">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ms-auto hidden items-center gap-2 sm:flex lg:ms-2">
          <ButtonLink href={GET_APP_PATH} variant="outline">
            Get the app
          </ButtonLink>
          <ButtonLink href={APP_PATH}>Start a circle</ButtonLink>
        </div>
        <button
          type="button"
          className="hover:bg-paper-sunk ms-auto -me-2 grid size-11 place-items-center rounded-full sm:ms-0 lg:hidden"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            ) : (
              <path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </nav>
      <div id={menuId} hidden={!open} className="border-line border-t lg:hidden">
        <ul className="mx-auto flex max-w-6xl flex-col px-5 py-3 sm:px-8">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center text-lg font-medium">
                {l.label}
              </Link>
            </li>
          ))}
          <li className="flex flex-col gap-2 pt-3 pb-2 sm:hidden">
            <ButtonLink href={APP_PATH} size="lg" className="w-full">
              Start a circle
            </ButtonLink>
            <ButtonLink href={GET_APP_PATH} size="lg" variant="outline" className="w-full">
              Get the app
            </ButtonLink>
          </li>
        </ul>
      </div>
    </header>
  );
}
