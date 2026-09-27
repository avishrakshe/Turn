import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A phone-shaped frame for showing real app components on the landing page. It's an
 * illustration: hidden from assistive tech and inert, so its buttons can't be tabbed to.
 * The surrounding text carries the meaning.
 */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      inert
      className={cn(
        "relative mx-auto aspect-[9/19] bg-[#1d1611] ring-1 ring-line-strong w-full max-w-[300px] rounded-[2.8rem] p-2.5 shadow-lift select-none",
        className,
      )}
    >
      <div className="bg-paper relative flex size-full flex-col overflow-hidden rounded-[2.2rem]">
        <div className="flex h-9 shrink-0 items-center justify-between px-6 pt-1 text-[0.7rem] font-semibold">
          <span className="tabular">9:41</span>
          <span className="absolute start-1/2 bg-[#1d1611] top-2 h-5 w-20 -translate-x-1/2 rounded-full rtl:translate-x-1/2" />
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 18 12" className="h-2.5"><path d="M1 11h2V8H1zm4 0h2V6H5zm4 0h2V3H9zm4 0h2V1h-2z" fill="currentColor" /></svg>
            <svg viewBox="0 0 24 12" className="h-2.5"><rect x="1" y="1" width="19" height="10" rx="2.5" fill="none" stroke="currentColor" /><rect x="3" y="3" width="13" height="6" rx="1" fill="currentColor" /></svg>
          </span>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}

/** App header inside a phone screen. */
export function ScreenHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-5 pt-3 pb-2">
      {sub && <p className="text-ink-muted text-[0.7rem] font-semibold tracking-wide uppercase">{sub}</p>}
      <p className="font-display text-xl leading-tight">{title}</p>
    </div>
  );
}
