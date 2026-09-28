import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A landing section with its round-counter chapter label ("ROUND 05 · LIVE"). */
export function Section({
  id,
  round,
  label,
  title,
  intro,
  children,
  className,
}: {
  id: string;
  round: number;
  label: string;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-20 py-20 sm:py-28", className)}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="reveal">
          <ChapterLabel round={round} label={label} />
          <h2 id={`${id}-title`} className="mt-4 max-w-3xl text-4xl sm:text-5xl">
            {title}
          </h2>
          {intro && <div className="text-ink-muted mt-5 max-w-2xl text-lg">{intro}</div>}
        </div>
        {children && <div className="reveal mt-12">{children}</div>}
      </div>
    </section>
  );
}

export function ChapterLabel({ round, label }: { round: number; label: string }) {
  return (
    <p className="chapter flex items-center gap-2">
      <span aria-hidden className="bg-marigold inline-block size-1.5 rounded-full" />
      Round {String(round).padStart(2, "0")} · {label}
    </p>
  );
}
