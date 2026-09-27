"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title. For money actions: "what happens next". */
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/**
 * Bottom sheet on phones, centred dialog from `sm` up. Built on <dialog> for a native
 * focus trap, Escape to close and inert background.
 */
export function Sheet({ open, onClose, title, description, children, footer }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "bg-paper-raised text-ink m-0 mt-auto w-full max-w-none rounded-t-[1.75rem] border-0 p-0 shadow-lift",
        "sm:m-auto sm:max-w-md sm:rounded-card",
        "backdrop:bg-[rgb(20_14_8/0.45)] backdrop:backdrop-blur-[2px]",
        "translate-y-0 opacity-100 transition-[translate,opacity,overlay,display] transition-discrete duration-(--duration-slow) ease-(--ease-out)",
        "starting:translate-y-8 starting:opacity-0",
        "not-open:translate-y-8 not-open:opacity-0",
      )}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div aria-hidden className="bg-line-strong mx-auto mt-3 h-1.5 w-10 rounded-full sm:hidden" />
        <header className="flex items-start gap-3 px-6 pt-5 sm:pt-6">
          <div className="flex-1">
            <h2 id={titleId} className="text-2xl">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-ink-muted mt-1.5 text-sm">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:bg-paper-sunk -me-2 -mt-1 grid size-11 place-items-center rounded-full"
          >
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {children && <div className="overflow-y-auto px-6 py-4">{children}</div>}
        {footer && <footer className="flex flex-col gap-2 px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{footer}</footer>}
      </div>
    </dialog>
  );
}
