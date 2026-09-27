import { cn } from "@/lib/cn";

/**
 * Placeholder shaped like the content it stands in for. Decorative: put aria-busy on the
 * region that is loading, not on each skeleton.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "animate-shimmer block rounded-lg bg-[length:200%_100%]",
        "bg-[linear-gradient(90deg,var(--paper-sunk)_25%,var(--line)_50%,var(--paper-sunk)_75%)]",
        className,
      )}
    />
  );
}
