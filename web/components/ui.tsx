"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { tap } from "@/lib/metrics";

export function Screen({
  title,
  back,
  children,
  nav = true,
  action,
}: {
  title?: string;
  back?: string | true;
  children: ReactNode;
  nav?: boolean;
  action?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {(title || back) && (
        <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg/90 px-4 pt-4 pb-3 backdrop-blur">
          {back && (
            <button
              aria-label="Back"
              onClick={() => (back === true ? router.back() : router.push(back))}
              className="-ml-2 rounded-full p-2 text-ink hover:bg-surface-2"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <h1 className="flex-1 text-lg font-bold">{title}</h1>
          {action}
        </header>
      )}
      <main className={`flex flex-1 flex-col gap-4 px-4 ${nav ? "pb-28" : "pb-8"}`}>{children}</main>
      {nav && <BottomNav />}
    </div>
  );
}

function BottomNav() {
  const path = usePathname();
  const items = [
    { href: "/home", label: "Home", icon: "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z" },
    { href: "/create", label: "New circle", icon: "M12 5v14M5 12h14" },
    { href: "/me", label: "My record", icon: "M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z" },
    { href: "/settings", label: "Settings", icon: "M4 6h16M4 12h16M4 18h16" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2">
        {items.map((it) => {
          const active = path === it.href || (it.href !== "/home" && path.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold ${active ? "text-primary" : "text-muted"}`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={it.icon} />
              </svg>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Button({
  variant = "primary",
  loading,
  children,
  className = "",
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean }) {
  const styles = {
    primary: "bg-primary text-primary-ink shadow-sm hover:brightness-110",
    secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
    ghost: "text-primary hover:bg-primary-soft",
    danger: "bg-surface text-bad border border-line hover:bg-surface-2",
  }[variant];
  return (
    <button
      {...rest}
      onClick={(e) => {
        tap();
        onClick?.(e);
      }}
      disabled={rest.disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold transition active:scale-[0.98] disabled:opacity-50 ${styles} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-5 w-5 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  // A caller-supplied background replaces the default (Tailwind can't resolve two bg-* utilities by order).
  const bg = /(^|\s)bg-/.test(className) ? "" : "bg-surface";
  return <section className={`rounded-3xl border border-line p-5 ${bg} ${className}`}>{children}</section>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" | "primary" }) {
  const t = {
    neutral: "bg-surface-2 text-muted",
    good: "bg-primary-soft text-good",
    warn: "bg-accent-soft text-warn",
    bad: "bg-surface-2 text-bad",
    accent: "bg-accent-soft text-warn",
    primary: "bg-primary-soft text-primary",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${t}`}>{children}</span>;
}

const PALETTE = ["#17594a", "#b3541e", "#6d4bb3", "#1e6fb3", "#b31e6d", "#8a7a12", "#2f7d32", "#a33b3b"];
export function Avatar({ seed, name, size = 40 }: { seed: string; name?: string; size?: number }) {
  const n = parseInt(seed.slice(2, 8) || "0", 16);
  const color = PALETTE[n % PALETTE.length];
  const initials = name
    ? name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : seed.slice(2, 4).toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "bad" | "good"; children: ReactNode }) {
  const t = { neutral: "bg-surface-2 text-ink", bad: "bg-surface-2 text-bad", good: "bg-primary-soft text-good" }[tone];
  return <p className={`rounded-2xl px-4 py-3 text-sm font-medium ${t}`}>{children}</p>;
}

export function Confetti() {
  const colors = ["#f2a541", "#17594a", "#3fb79d", "#b3541e", "#6d4bb3"];
  return (
    <>
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="confetti-bit"
          style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 9) * 0.08}s` }}
        />
      ))}
    </>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="num text-lg font-bold">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
