import { cn } from "@/lib/cn";

interface StepperProps {
  steps: string[];
  current: number;
  label?: string;
  /** Translated "Step 2 of 4" and "done", for the app's language. */
  stepOf?: string;
  doneLabel?: string;
  className?: string;
}

/** Multi-step flow indicator. `current` is 0-based. Labels collapse to the current one on phones. */
export function Stepper({ steps, current, label = "Progress", stepOf, doneLabel = "done", className }: StepperProps) {
  return (
    <nav aria-label={label} className={className}>
      <p className="text-ink-muted mb-3 text-sm sm:sr-only">
        {stepOf ?? `Step ${current + 1} of ${steps.length}`}: <span className="text-ink font-semibold">{steps[current]}</span>
      </p>
      <ol className="flex items-center gap-2">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} aria-current={active ? "step" : undefined} className="flex flex-1 items-center gap-2 last:flex-none">
              <span
                className={cn(
                  "tabular grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors duration-(--duration-base)",
                  done && "bg-teal text-on-teal",
                  active && "bg-marigold text-on-marigold ring-4 ring-marigold-soft",
                  !done && !active && "border-line-strong text-ink-muted border",
                )}
              >
                {done ? (
                  <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className={cn("hidden text-sm sm:inline", active ? "font-semibold" : "text-ink-muted")}>
                {s}
                {done && <span className="sr-only"> ({doneLabel})</span>}
              </span>
              {i < steps.length - 1 && <span aria-hidden className={cn("h-0.5 flex-1 rounded-full", done ? "bg-teal" : "bg-line")} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
