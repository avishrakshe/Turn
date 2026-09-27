import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Tone = "raised" | "sunk" | "turn";

const tones: Record<Tone, string> = {
  raised: "bg-paper-raised border-line shadow-soft",
  sunk: "bg-paper-sunk border-transparent",
  // The "your turn" card: the only place a card is tinted marigold.
  turn: "bg-marigold-soft border-marigold/40 shadow-soft",
};

export function Card({ tone = "raised", className, ...rest }: ComponentProps<"div"> & { tone?: Tone }) {
  return <div className={cn("rounded-card border p-5 sm:p-6", tones[tone], className)} {...rest} />;
}
