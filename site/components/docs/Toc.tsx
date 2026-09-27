"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

interface Item {
  id: string;
  text: string;
  level: 2 | 3;
}

/** "On this page": built from the rendered headings, highlighting the section being read. */
export function Toc() {
  const pathname = usePathname();
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const heads = Array.from(document.querySelectorAll<HTMLHeadingElement>("#doc-content h2[id], #doc-content h3[id]"));
    setItems(
      heads.map((h) => ({
        id: h.id,
        // Drop the "#" anchor link from the label.
        text: (h.firstChild?.textContent ?? h.textContent ?? "").replace(/#$/, "").trim(),
        level: h.tagName === "H2" ? 2 : 3,
      })),
    );
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    heads.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [pathname]);

  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page">
      <p className="text-ink-muted mb-3 text-xs font-semibold tracking-[0.12em] uppercase">On this page</p>
      <ul className="border-line border-s">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              aria-current={active === it.id ? "location" : undefined}
              className={cn(
                "-ms-px block border-s-2 py-1.5 text-sm leading-snug transition-colors",
                it.level === 3 ? "ps-6" : "ps-3",
                active === it.id ? "border-marigold text-ink font-medium" : "text-ink-muted hover:text-ink border-transparent",
              )}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
