"use client";

import { useEffect, useRef, useState } from "react";
import { polar } from "@/components/ring/geometry";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { getSound } from "@/lib/sound";

/** Set once the visitor has been through the intro; the root layout's head script reads it. */
export const INTRO_KEY = "turn-intro";

type Stage = "load" | "gate" | "leave" | "gone";

/**
 * First-visit intro: six seats fill as the page really loads (fonts, the page itself, and the
 * 3D engine for the film), then a gate asks whether to enter with sound. Shown once per device,
 * and skipped for anyone arriving at a specific section.
 */
export function Intro() {
  const [stage, setStage] = useState<Stage>("load");
  const [lit, setLit] = useState(0);
  const pct = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  // The page behind the intro can't be reached by keyboard or screen reader until it's gone.
  const blocked = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.intro === "seen") {
      setStage("gone");
      return;
    }
    html.dataset.intro = "show";
    blocked.current = Array.from(document.querySelectorAll<HTMLElement>("#main, .site-nav, .site-footer, .skip-link"));
    for (const el of blocked.current) el.inert = true;

    let target = 0;
    let shown = 0;
    let cancelled = false;
    let raf = 0;
    const tasks: Array<Promise<unknown>> = [
      document.fonts?.ready ?? Promise.resolve(),
      document.readyState === "complete" ? Promise.resolve() : new Promise((r) => window.addEventListener("load", r, { once: true })),
      import("./film/scene").catch(() => undefined),
    ];
    let done = 0;
    for (const p of tasks) void p.then(() => (target = ++done / tasks.length));

    const tick = () => {
      shown += (target - shown) * 0.12;
      if (target - shown < 0.002) shown = target;
      if (pct.current) pct.current.textContent = `${Math.round(shown * 100)}%`;
      if (bar.current) bar.current.style.transform = `scaleX(${shown})`;
      setLit(Math.floor(shown * 6 + 1e-6));
      if (!cancelled && shown < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Open the gate once everything's loaded (and the ring has had a moment to fill), or after
    // six seconds on a slow connection: the film finishes loading behind the gate.
    const began = performance.now();
    void Promise.race([Promise.all(tasks), new Promise((r) => setTimeout(r, 6000))]).then(() => {
      target = 1;
      setTimeout(() => !cancelled && setStage("gate"), Math.max(500, 1300 - (performance.now() - began)));
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      for (const el of blocked.current) el.inert = false;
    };
  }, []);

  useEffect(() => {
    if (stage !== "gate") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && enter(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function enter(withSound: boolean) {
    const sound = getSound();
    if (withSound) {
      sound.enable();
      sound.chime("hello");
    } else {
      sound.disable();
    }
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      // Private mode: they'll see it again next time.
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStage("leave");
    setTimeout(() => {
      document.documentElement.dataset.intro = "seen";
      for (const el of blocked.current) el.inert = false;
      setStage("gone");
    }, reduced ? 0 : 700);
  }

  if (stage === "gone") return null;
  const gate = stage !== "load";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Turn"
      className={cn("intro bg-paper fixed inset-0 z-[70] grid place-items-center overflow-y-auto px-6 py-10", stage === "leave" && "intro-leave")}
    >
      <noscript>
        <style>{".intro{display:none}"}</style>
      </noscript>
      <div className="flex max-w-lg flex-col items-center text-center">
        <svg viewBox="0 0 120 120" className="size-36 sm:size-44" aria-hidden>
          <circle cx="60" cy="60" r="44" fill="none" stroke="var(--line-strong)" strokeWidth="1.2" strokeDasharray="1.5 5" strokeLinecap="round" />
          <circle
            cx="60"
            cy="60"
            r="44"
            fill="none"
            stroke="var(--teal)"
            strokeWidth="1.6"
            className="transition-opacity duration-700"
            style={{ opacity: gate ? 0.35 : 0 }}
          />
          {Array.from({ length: 6 }, (_, k) => {
            const p = polar(60, 60, 44, k * 60);
            // Filling, seats light marigold one by one. At the gate they settle into the Turn
            // mark: teal seats, one marigold seat at two o'clock.
            const fill = gate ? (k === 1 ? "var(--marigold)" : "var(--teal)") : k < lit ? "var(--marigold)" : "var(--paper-raised)";
            return (
              <circle
                key={k}
                cx={p.x}
                cy={p.y}
                r={gate ? (k === 1 ? 12 : 7) : k < lit ? 9 : 7}
                fill={fill}
                stroke={gate && k !== 1 ? "transparent" : k < lit || gate ? "var(--paper)" : "var(--line-strong)"}
                strokeWidth="2.5"
                className="transition-[r,fill,stroke] duration-500 ease-(--ease-spring)"
              />
            );
          })}
        </svg>

        {!gate ? (
          <div className="mt-8 w-56">
            <p className="font-mono text-ink-muted flex justify-between text-[11px] tracking-[0.2em] uppercase">
              <span>Filling the pot</span>
              <span ref={pct} className="tabular">
                0%
              </span>
            </p>
            <div className="bg-line mt-3 h-[3px] overflow-hidden rounded-full">
              <div ref={bar} className="bg-marigold h-full origin-left rounded-full rtl:origin-right" style={{ transform: "scaleX(0)" }} />
            </div>
            <p className="sr-only" role="status">
              Loading
            </p>
          </div>
        ) : (
          <div className="intro-gate mt-8 flex flex-col items-center">
            <p className="font-mono text-marigold-ink text-[11px] tracking-[0.22em] uppercase">Six of six seats filled</p>
            <h2 className="mt-4 text-4xl sm:text-5xl">
              Everyone&rsquo;s in.
              <br />
              Your turn.
            </h2>
            <p className="text-ink-muted mt-4 max-w-sm text-lg">
              Scroll through one family&rsquo;s savings circle, month by month. It&rsquo;s best with sound.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" autoFocus onClick={() => enter(true)}>
                <SpeakerIcon />
                Enter with sound
              </Button>
              <Button size="lg" variant="outline" onClick={() => enter(false)}>
                Enter quietly
              </Button>
            </div>
            <p className="font-mono text-ink-faint mt-6 text-[10.5px] tracking-[0.16em] uppercase">Sound plays only while the film moves</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
