import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { polar } from "@/components/ring/geometry";

/** Friendly empty state: an empty ring, one line of context, and a single next step. */
export function EmptyState({ title, body, action, className }: { title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-4 px-6 py-10 text-center", className)}>
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden>
        <circle cx="44" cy="44" r="32" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round" />
        {Array.from({ length: 6 }, (_, i) => {
          const p = polar(44, 44, 32, i * 60);
          return <circle key={i} cx={p.x} cy={p.y} r="7" fill="var(--paper-sunk)" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray={i === 0 ? undefined : "3 3"} />;
        })}
        <circle cx="44" cy="12" r="7" fill="var(--marigold-soft)" stroke="var(--marigold)" strokeWidth="2" />
      </svg>
      <div className="flex max-w-xs flex-col gap-1.5">
        <h3 className="text-xl">{title}</h3>
        {body && <p className="text-ink-muted text-sm">{body}</p>}
      </div>
      {action}
    </div>
  );
}
