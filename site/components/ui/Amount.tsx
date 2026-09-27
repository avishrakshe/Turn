import { cn } from "@/lib/cn";
import { type DisplayCurrency, formatMoney, formatMoneyParts } from "@/lib/money";

type Size = "sm" | "md" | "lg" | "xl";

const sizes: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
  xl: "font-display text-5xl sm:text-6xl",
};

export interface AmountProps {
  value: number;
  currency: DisplayCurrency;
  locale?: string;
  size?: Size;
  /** Optional "≈ $X" hint in USD. Never shown for AUSD; local currency is primary. */
  approxUsd?: number;
  className?: string;
}

/** Money, always in the viewer's currency, always tabular. */
export function Amount({ value, currency, locale, size = "md", approxUsd, className }: AmountProps) {
  const parts = formatMoneyParts(value, currency, { locale });
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      {/* dir="ltr" isolates the amount so the symbol stays on the right side inside RTL (Urdu) text. */}
      <data value={value} dir="ltr" className={cn("tabular font-semibold tracking-tight", sizes[size])}>
        {parts.map((p, i) =>
          p.type === "currency" ? (
            <span key={i} className={cn(size === "xl" && "me-0.5 align-[0.35em] text-[0.5em] font-sans font-medium", "text-ink-muted")}>
              {p.value}
            </span>
          ) : (
            <span key={i}>{p.value}</span>
          ),
        )}
      </data>
      {approxUsd !== undefined && currency !== "USD" && (
        <span className="tabular text-ink-muted text-sm">≈ {formatMoney(approxUsd, "USD", { fractionDigits: 0 })}</span>
      )}
    </span>
  );
}
