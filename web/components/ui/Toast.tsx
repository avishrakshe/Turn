"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warning" | "danger";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: Tone;
  /** One recovery or follow-up action, e.g. "Try again". */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const accent: Record<Tone, string> = {
  neutral: "bg-teal",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId++;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      // Toasts with an action stay longer so there is time to reach the button.
      window.setTimeout(() => dismiss(id), t.durationMs ?? (t.action ? 10000 : 5000));
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end"
      >
        <ol className="contents" aria-live="polite">
          {items.map((t) => (
            <li
              key={t.id}
              className={cn(
                "bg-paper-raised border-line shadow-lift pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-4",
                "transition-[translate,opacity] duration-(--duration-slow) ease-(--ease-out) starting:translate-y-4 starting:opacity-0",
              )}
            >
              <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", accent[t.tone ?? "neutral"])} />
              <div className="flex-1">
                <p className="font-semibold">{t.title}</p>
                {t.description && <p className="text-ink-muted mt-0.5 text-sm">{t.description}</p>}
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="text-teal-ink -ms-2 mt-1 min-h-11 rounded-lg px-2 text-sm font-semibold underline-offset-4 hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="text-ink-muted hover:bg-paper-sunk -me-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-full"
              >
                <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </ToastContext.Provider>
  );
}
