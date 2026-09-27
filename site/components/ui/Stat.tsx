import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./Skeleton";

export interface StatProps {
  label: string;
  value?: ReactNode;
  /** Where the number comes from, e.g. "on Monad testnet". Required for public stats. */
  source?: string;
  loading?: boolean;
  className?: string;
}

export function Stat({ label, value, source, loading, className }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)} aria-busy={loading || undefined}>
      <dt className="text-ink-muted order-2 text-sm">{label}</dt>
      <dd className="tabular font-display order-1 text-4xl leading-none font-medium tracking-tight">
        {loading ? <Skeleton className="h-9 w-24" /> : value}
      </dd>
      {source && <dd className="text-ink-muted order-3 text-xs">{source}</dd>}
    </div>
  );
}
