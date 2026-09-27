import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "turn" | "trust" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-paper-sunk text-ink-muted",
  // Ringed so it still reads as a badge when it sits on a marigold-soft "turn" card.
  turn: "bg-marigold-soft text-marigold-ink ring-1 ring-inset ring-marigold/50",
  trust: "bg-teal-soft text-teal-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

const dots: Record<Tone, string> = {
  neutral: "bg-ink-faint",
  turn: "bg-marigold",
  trust: "bg-teal",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs leading-none font-semibold", tones[tone], className)}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}
