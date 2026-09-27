"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { DOC_GROUPS, docHref } from "@/lib/docs";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs">
      {DOC_GROUPS.map((g) => (
        <div key={g.title} className="mb-6">
          <p className="text-ink-muted mb-2 px-3 text-xs font-semibold tracking-[0.12em] uppercase">{g.title}</p>
          <ul>
            {g.pages.map((p) => {
              const href = docHref(p.slug);
              const active = pathname === href;
              return (
                <li key={p.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center rounded-xl px-3 text-[0.95rem] transition-colors",
                      active ? "bg-marigold-soft text-ink font-semibold" : "text-ink-muted hover:bg-paper-sunk hover:text-ink",
                    )}
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
