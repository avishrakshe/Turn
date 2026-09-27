import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { RingLoader } from "@/components/ring/RingLoader";

type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-pill font-semibold whitespace-nowrap " +
  "transition-[background-color,border-color,color,transform,box-shadow] duration-(--duration-fast) ease-(--ease-out) " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress";

const variants: Record<Variant, string> = {
  // Marigold is reserved for the one primary action on a screen.
  primary: "bg-marigold text-on-marigold shadow-soft hover:bg-marigold-hover",
  secondary: "bg-teal text-on-teal hover:bg-teal-hover",
  outline: "border border-line-strong bg-paper-raised text-ink hover:border-ink-muted",
  ghost: "text-ink hover:bg-paper-sunk",
};

const sizes: Record<Size, string> = {
  md: "px-5 text-[0.95rem]",
  lg: "min-h-13 px-7 text-base",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  /** Shows the ring loader and blocks further presses. */
  busy?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export type ButtonProps = CommonProps & Omit<ComponentProps<"button">, keyof CommonProps>;

export function Button({ variant = "primary", size = "md", busy, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <RingLoader size={18} label="Working" /> : icon}
      {children}
    </button>
  );
}

export type ButtonLinkProps = CommonProps & Omit<ComponentProps<typeof Link>, keyof CommonProps>;

export function ButtonLink({ variant = "primary", size = "md", icon, className, children, busy: _busy, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
