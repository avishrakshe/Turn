"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Advances a ring every `intervalMs`. Starts paused for reduced-motion users and pauses
 * while the tab is hidden. Always pair with a visible pause control (WCAG 2.2.2).
 */
export function useRingAutoplay(intervalMs = 3200) {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const paused = userPaused ?? reduced;

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setStep((s) => s + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [paused, intervalMs]);

  const toggle = useCallback(() => setUserPaused(!paused), [paused]);
  const next = useCallback(() => setStep((s) => s + 1), []);

  return { step, paused, toggle, next };
}
