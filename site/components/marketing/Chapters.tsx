"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { PhoneFrame } from "./PhoneFrame";
import { ChapterLabel } from "./Section";

export interface Chapter {
  id: string;
  label: string;
  title: string;
  body: ReactNode;
  screen: ReactNode;
}

/**
 * The four "how it works" chapters. On desktop a sticky phone on the side switches screens as
 * each chapter scrolls into the middle of the viewport. On phones each chapter shows its own
 * screen inline, under its text.
 */
export function Chapters({ chapters }: { chapters: Chapter[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      // A thin band across the middle of the viewport decides which chapter is current.
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const el of refs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div id="how" className="mx-auto max-w-6xl scroll-mt-16 px-5 sm:px-8">
      <div className="lg:grid lg:grid-cols-[1fr_minmax(0,340px)] lg:gap-20">
        <div>
          {chapters.map((c, i) => (
            <article
              key={c.id}
              id={c.id}
              data-index={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              aria-labelledby={`${c.id}-title`}
              className="flex scroll-mt-20 flex-col justify-center py-16 lg:min-h-[88vh] lg:py-0"
            >
              <ChapterLabel round={i + 1} label={c.label} />
              <h2 id={`${c.id}-title`} className="mt-4 max-w-xl text-4xl sm:text-5xl">
                {c.title}
              </h2>
              <div className="text-ink-muted mt-5 max-w-lg space-y-4 text-lg">{c.body}</div>
              <div className="mt-10 lg:hidden">
                <PhoneFrame className="max-w-[280px]">{c.screen}</PhoneFrame>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-[max(5rem,calc(50vh-310px))] py-10">
            <div className="relative">
              {/* Progress rail: one dot per chapter */}
              <ol aria-hidden className="absolute top-1/2 -start-10 flex -translate-y-1/2 flex-col gap-3">
                {chapters.map((c, i) => (
                  <li
                    key={c.id}
                    className={cn(
                      "size-2 rounded-full transition-[background-color,transform] duration-(--duration-base)",
                      i === active ? "bg-marigold scale-150" : i < active ? "bg-teal" : "bg-line-strong",
                    )}
                  />
                ))}
              </ol>
              <PhoneFrame>
                {chapters.map((c, i) => (
                  <div
                    key={c.id}
                    className={cn(
                      "absolute inset-0 flex flex-col transition-[opacity,translate] duration-(--duration-slow) ease-(--ease-out)",
                      i === active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
                    )}
                  >
                    {c.screen}
                  </div>
                ))}
              </PhoneFrame>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
