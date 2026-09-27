"use client";
// Turn design system: screen scaffold, navigation, buttons, cards, sheets, toasts, skeletons, avatars.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { tap } from "@/lib/metrics";
import { Icon, type IconName } from "./icons";

// ---- screen scaffold -------------------------------------------------------------------------------------------

export function Screen({
  title,
  back,
  children,
  nav = true,
  action,
  large,
}: {
  title?: string;
  back?: string | true;
  children: ReactNode;
  nav?: boolean;
  action?: ReactNode;
  /** iOS-style large title that sits in the content instead of the bar */
  large?: boolean;
}) {
  const router = useRouter();
  return (
    <div className="flex min-h-full flex-col">
      {(title || back || action) && (
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-bg/80 px-3 backdrop-blur-xl">
          {back ? (
            <button
              aria-label="Back"
              onClick={() => (back === true ? router.back() : router.push(back))}
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink transition hover:bg-surface-2 active:scale-95"
            >
              <Icon name="back" size={22} strokeWidth={2.4} />
            </button>
          ) : (
            <span className="w-1" />
          )}
          <h1 className={`flex-1 truncate text-[17px] font-bold ${large ? "opacity-0" : ""}`}>{title}</h1>
          {action}
        </header>
      )}
      <main className={`flex flex-1 flex-col gap-4 px-4 pt-1 ${nav ? "pb-28" : "pb-10"}`}>
        {large && title && <h1 className="-mt-1 mb-1 text-[28px] font-extrabold tracking-tight">{title}</h1>}
        {children}
      </main>
      {nav && <BottomNav />}
    </div>
  );
}

function BottomNav() {
  const path = usePathname();
  const items: { href: string; label: string; icon: IconName }[] = [
    { href: "/home", label: "Home", icon: "home" },
    { href: "/create", label: "New circle", icon: "plus" },
    { href: "/me", label: "My record", icon: "star" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ];
  return (
    <nav className="sticky bottom-0 z-20 mt-auto border-t border-line bg-surface/90 backdrop-blur-xl">
      <div className="grid grid-cols-4 px-2 pb-[max(env(safe-area-inset-bottom),10px)] pt-2">
        {items.map((it) => {
          const active = path === it.href || (it.href !== "/home" && path.startsWith(it.href)) || (it.href === "/me" && path.startsWith("/credit"));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center gap-1 rounded-xl py-1 text-[11px] font-semibold transition ${active ? "text-primary" : "text-muted hover:text-ink"}`}
            >
              <span className={`flex h-8 w-14 items-center justify-center rounded-full transition ${active ? "bg-primary-soft" : ""}`}>
                <Icon name={it.icon} size={21} strokeWidth={active ? 2.4 : 2} />
              </span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ---- buttons ------------------------------------------------------------------------------------------------------

export function Button({
  variant = "primary",
  size = "lg",
  loading,
  icon,
  children,
  className = "",
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  size?: "lg" | "md" | "sm";
  loading?: boolean;
  icon?: IconName;
}) {
  const styles = {
    primary: "bg-gradient-to-b from-primary to-primary-deep text-primary-ink shadow-[0_8px_20px_-8px_var(--primary)] hover:brightness-110",
    accent: "bg-accent text-[#2a1a05] shadow-[0_8px_20px_-10px_var(--accent)] hover:brightness-105",
    secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
    ghost: "text-primary hover:bg-primary-soft",
    danger: "bg-surface text-bad border border-line hover:bg-surface-2",
  }[variant];
  const sizes = { lg: "min-h-[52px] px-5 text-base rounded-2xl", md: "min-h-11 px-4 text-[15px] rounded-xl", sm: "min-h-9 px-3 text-sm rounded-xl" }[size];
  return (
    <button
      {...rest}
      onClick={(e) => {
        tap();
        onClick?.(e);
      }}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-bold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${styles} ${className}`}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={19} strokeWidth={2.3} /> : null}
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

// ---- surfaces -----------------------------------------------------------------------------------------------------

export function Card({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  // A caller-supplied background replaces the default (Tailwind can't resolve two bg-* utilities by order).
  const bg = /(^|\s)bg-/.test(className) ? "" : "bg-surface";
  return (
    <section onClick={onClick} className={`rounded-[28px] border border-line p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${bg} ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-between px-1">
      <h2 className="text-[15px] font-extrabold tracking-tight text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" | "primary" }) {
  const t = {
    neutral: "bg-surface-2 text-muted",
    good: "bg-good-soft text-good",
    warn: "bg-accent-soft text-warn",
    bad: "bg-bad-soft text-bad",
    accent: "bg-accent-soft text-warn",
    primary: "bg-primary-soft text-primary",
  }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${t}`}>{children}</span>;
}

export function Notice({ tone = "neutral", icon, children }: { tone?: "neutral" | "bad" | "good" | "warn"; icon?: IconName; children: ReactNode }) {
  const t = { neutral: "bg-surface-2 text-ink", bad: "bg-bad-soft text-bad", good: "bg-good-soft text-good", warn: "bg-accent-soft text-warn" }[tone];
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={`flex gap-3 rounded-2xl px-4 py-3 text-sm font-medium ${t}`}>
      {icon && <Icon name={icon} size={18} className="mt-0.5 shrink-0" />}
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="num text-lg font-extrabold">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-2 ${className}`} />;
}

// ---- people ---------------------------------------------------------------------------------------------------------

const PALETTE = ["#17594a", "#c2571a", "#6d4bb3", "#1e6fb3", "#b31e6d", "#8a6d12", "#2f7d32", "#a33b3b"];
export function avatarColor(seed: string) {
  const n = parseInt(seed.slice(2, 8) || "0", 16);
  return PALETTE[n % PALETTE.length]!;
}
export function Avatar({ seed, name, size = 40, ring }: { seed: string; name?: string; size?: number; ring?: boolean }) {
  const initials = name
    ? name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${ring ? "ring-[3px] ring-surface" : ""}`}
      style={{ width: size, height: size, background: `linear-gradient(145deg, ${avatarColor(seed)}, ${avatarColor(seed)}cc)`, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials || <Icon name="users" size={size * 0.45} strokeWidth={2.2} />}
    </span>
  );
}

export function AvatarStack({ seeds, max = 4, size = 28 }: { seeds: string[]; max?: number; size?: number }) {
  const shown = seeds.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((s, i) => (
        <span key={s} style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <Avatar seed={s} size={size} ring />
        </span>
      ))}
      {seeds.length > max && (
        <span className="ml-1 text-xs font-bold text-muted">+{seeds.length - max}</span>
      )}
    </span>
  );
}

// ---- bottom sheet -----------------------------------------------------------------------------------------------------

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal aria-label={title}>
      <button aria-label="Close" className="sheet-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="sheet-up relative w-full max-w-[430px] rounded-t-[32px] bg-surface px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto pb-2">{children}</div>
      </div>
    </div>
  );
}

// ---- toasts -------------------------------------------------------------------------------------------------------------

type Toast = { id: number; text: string; tone: "good" | "bad" | "neutral"; icon?: IconName };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"], icon?: IconName) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "good", icon?: IconName) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`toast-in pointer-events-auto flex max-w-[400px] items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl ${
              t.tone === "bad" ? "bg-bad text-white" : t.tone === "neutral" ? "bg-ink text-bg" : "bg-primary text-primary-ink"
            }`}
          >
            <Icon name={t.icon ?? (t.tone === "bad" ? "info" : "check")} size={18} strokeWidth={2.6} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ---- celebration --------------------------------------------------------------------------------------------------------

export function Confetti() {
  const colors = ["#f2a541", "#17594a", "#3fb79d", "#c2571a", "#6d4bb3"];
  return (
    <>
      {Array.from({ length: 40 }, (_, i) => (
        <span
          key={i}
          className="confetti-bit"
          style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 9) * 0.07}s` }}
        />
      ))}
    </>
  );
}

// ---- list rows ------------------------------------------------------------------------------------------------------------

export function Row({ icon, title, subtitle, href, right, onClick }: { icon?: IconName; title: ReactNode; subtitle?: ReactNode; href?: string; right?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      {icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        {subtitle && <span className="block truncate text-xs text-muted">{subtitle}</span>}
      </span>
      {right ?? (href || onClick ? <Icon name="chevron" size={18} className="text-muted" /> : null)}
    </>
  );
  const cls = "flex w-full items-center gap-3 py-3 text-left";
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}
