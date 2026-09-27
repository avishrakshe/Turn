"use client";

import { useMemo } from "react";

const COLORS = ["var(--marigold)", "var(--teal)", "var(--av-3)", "var(--av-5)", "var(--av-6)", "var(--marigold-soft)"];

/**
 * The one celebration in the app: a short burst of confetti and a bloom, only on "your turn".
 * Decorative and pointer-transparent. With reduced motion, the global rule reduces it to nothing.
 */
export function Celebration() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 7) * 60}ms`,
        duration: `${1400 + ((i * 53) % 700)}ms`,
        drift: `${((i * 29) % 80) - 40}px`,
        spin: `${360 + ((i * 47) % 360)}deg`,
        color: COLORS[i % COLORS.length],
        w: 6 + (i % 3) * 2,
      })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden motion-reduce:hidden">
      <div className="bg-marigold absolute start-1/2 top-1/3 size-64 -translate-x-1/2 rounded-full opacity-0 blur-2xl [animation:bloom_900ms_var(--ease-out)_forwards] rtl:translate-x-1/2" />
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 rounded-sm"
          style={
            {
              left: p.left,
              width: p.w,
              height: p.w * 1.6,
              background: p.color,
              animation: `confetti-fall ${p.duration} var(--ease-out) ${p.delay} both`,
              "--drift": p.drift,
              "--spin": p.spin,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
