import type { ReactNode } from "react";

/** The first layer of every docs page: 3–5 sentences anyone can follow. */
export function PlainWords({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="in-plain-words" className="plain-words bg-marigold-soft/60 border-marigold/30 not-prose my-8 rounded-card border p-6">
      <h2 id="in-plain-words" className="chapter font-sans !mt-0 !text-xs">
        In plain words
      </h2>
      <div className="mt-3 space-y-3 text-[1.1rem] leading-relaxed">{children}</div>
    </section>
  );
}

/** Marks the start of the second layer: technical detail for builders. */
export function UnderTheHood() {
  return (
    <div className="not-prose mt-14 mb-2 flex items-center gap-3" role="presentation">
      <span className="bg-line h-px flex-1" />
      <span className="chapter !text-teal-ink">Under the hood</span>
      <span className="bg-line h-px flex-1" />
    </div>
  );
}

type Tone = "note" | "warning" | "honest";

const tones: Record<Tone, { cls: string; label: string }> = {
  note: { cls: "bg-teal-soft/60 border-teal/25", label: "Note" },
  warning: { cls: "bg-warning-soft border-warning/30", label: "Careful" },
  honest: { cls: "bg-paper-sunk border-line-strong", label: "Honest limitation" },
};

export function Callout({ tone = "note", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const t = tones[tone];
  return (
    <aside className={`not-prose my-6 rounded-2xl border p-5 ${t.cls}`}>
      <p className="text-sm font-semibold">{title ?? t.label}</p>
      <div className="text-ink-muted mt-1.5 space-y-2 leading-relaxed [&_code]:text-ink">{children}</div>
    </aside>
  );
}
