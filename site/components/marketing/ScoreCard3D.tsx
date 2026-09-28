"use client";

import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { TurnMark } from "@/components/ring/TurnMark";
import { cn } from "@/lib/cn";

interface Props {
  score: number;
  summary: string;
  /** The record the score is computed from, shown on the back. */
  record: Array<[string, string]>;
}

const REST = { rx: -7, ry: 13 };

/**
 * The example Turn Score card as an object: drag it (or use the arrow keys) to turn it in 3D,
 * turn it over to see the record behind the score. Notes are pinned to its face and float a
 * little above it, so they move with the card.
 */
export function ScoreCard3D({ score, summary, record }: Props) {
  const card = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  const s = useRef({ rx: REST.rx, ry: REST.ry, drag: null as null | { x: number; y: number; rx: number; ry: number }, flipped: false, visible: false });

  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const st = s.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!st.drag) {
        // Spring back to rest on whichever face is up, with a slow idle sway.
        const sway = reduced ? 0 : Math.sin(now / 1900) * 4;
        const targetY = (st.flipped ? 180 : 0) + REST.ry + sway;
        const targetX = REST.rx + (reduced ? 0 : Math.cos(now / 2300) * 2);
        const k = reduced ? 1 : 1 - Math.exp(-dt * 6);
        st.ry += (targetY - st.ry) * k;
        st.rx += (targetX - st.rx) * k;
      }
      el.style.transform = `rotateX(${st.rx.toFixed(2)}deg) rotateY(${st.ry.toFixed(2)}deg)`;
      // Light slides across the surface as it turns.
      el.style.setProperty("--gx", `${50 + ((((st.ry % 360) + 540) % 360) - 180) * -1.4}%`);
      el.style.setProperty("--gy", `${50 + st.rx * 2}%`);
      if (shadow.current) shadow.current.style.transform = `translateX(${(-st.ry % 180) * 0.15}px) scaleX(${Math.max(0.35, Math.abs(Math.cos((st.ry * Math.PI) / 180)))})`;
    };
    const io = new IntersectionObserver(([e]) => {
      s.current.visible = !!e?.isIntersecting;
      cancelAnimationFrame(raf);
      if (s.current.visible) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  function setFace(back: boolean) {
    s.current.flipped = back;
    setFlipped(back);
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    s.current.drag = { x: e.clientX, y: e.clientY, rx: s.current.rx, ry: s.current.ry };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = s.current.drag;
    if (!d) return;
    s.current.ry = d.ry + (e.clientX - d.x) * 0.45;
    s.current.rx = Math.max(-35, Math.min(35, d.rx - (e.clientY - d.y) * 0.3));
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    const d = s.current.drag;
    if (!d) return;
    s.current.drag = null;
    const st = s.current;
    // A press without a drag is a click: turn it over.
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) {
      setFace(!st.flipped);
      return;
    }
    // Settle on whichever face is nearer the viewer, and unwind any extra turns so the spring
    // doesn't spin it back (a whole turn looks the same).
    const a = (((st.ry - REST.ry) % 360) + 360) % 360;
    const back = a > 90 && a < 270;
    const target = (back ? 180 : 0) + REST.ry;
    st.ry = target + ((((st.ry - target) % 360) + 540) % 360) - 180;
    setFace(back);
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    if (["ArrowLeft", "ArrowRight", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      setFace(!s.current.flipped);
    }
  }

  return (
    // On phones the tilted card and its notes could poke past the screen edge; clip them.
    <figure className="mx-auto w-full max-w-md max-sm:overflow-x-clip max-sm:py-2">
      <div className="relative [perspective:1100px]">
        <div
          ref={card}
          role="button"
          tabIndex={0}
          aria-pressed={flipped}
          aria-label={flipped ? "Example Turn Score card, back: the record behind the score. Press to turn it over." : "Example Turn Score card. Press to turn it over and see the record behind the score."}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={key}
          className="score-card relative aspect-[1.6/1] cursor-grab touch-pan-y select-none [transform-style:preserve-3d] active:cursor-grabbing"
          style={{ transform: `rotateX(${REST.rx}deg) rotateY(${REST.ry}deg)` }}
        >
          {/* Front */}
          <div className="bg-teal text-on-teal shadow-lift absolute inset-0 overflow-hidden rounded-[1.6rem] p-6 [backface-visibility:hidden] sm:p-7">
            <svg aria-hidden viewBox="0 0 200 200" className="absolute -end-16 -top-16 size-64 opacity-20">
              <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
              {Array.from({ length: 8 }, (_, i) => {
                const a = ((i * 45 - 90) * Math.PI) / 180;
                return <circle key={i} cx={100 + 70 * Math.cos(a)} cy={100 + 70 * Math.sin(a)} r={i === 1 ? 14 : 9} fill="currentColor" />;
              })}
            </svg>
            <div className="relative flex h-full flex-col">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="bg-paper grid size-8 place-items-center rounded-full">
                  <TurnMark size={22} />
                </span>
                Turn Score
              </div>
              <p className="font-display mt-auto text-6xl leading-none sm:text-7xl">{score}</p>
              <p className="mt-2 text-sm font-medium opacity-90">{summary}</p>
              <p className="mt-3 text-xs opacity-75">Verifiable onchain · link included when shared</p>
            </div>
            <span aria-hidden className="score-glare pointer-events-none absolute inset-0 rounded-[1.6rem]" />
          </div>

          {/* Notes pinned to the face, floating just above it. */}
          <Pin className="start-[46%] top-[62%]" label="Public formula" />
          <Pin className="start-[48%] top-[17%]" label="Earned by paying on time" />

          {/* Back */}
          <div className="bg-paper-raised border-line text-ink absolute inset-0 overflow-hidden rounded-[1.6rem] border p-6 [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-7">
            <p className="chapter">On record</p>
            <dl className="tabular mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
              {record.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="text-end font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-ink-muted mt-3 text-xs">Kept in a public onchain registry that only circles can write to, as payments happen. Anyone can check it.</p>
            <span aria-hidden className="score-glare pointer-events-none absolute inset-0 rounded-[1.6rem]" />
          </div>
        </div>
        <div ref={shadow} aria-hidden className="mx-auto mt-5 h-4 w-3/4 rounded-[50%] bg-[rgb(var(--shadow-color)/0.18)] blur-md" />
      </div>
      <figcaption className="text-ink-muted mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm">
        <span>Example card, not a real person.</span>
        <button type="button" onClick={() => setFace(!flipped)} className="text-teal-ink min-h-11 font-semibold">
          {flipped ? "Turn to the front" : "Turn it over"} <span aria-hidden>↻</span>
        </button>
      </figcaption>
    </figure>
  );
}

function Pin({ label, className }: { label: ReactNode; className?: string }) {
  return (
    <span aria-hidden className={cn("score-pin pointer-events-none absolute flex items-center gap-1.5", className)}>
      <span className="bg-marigold ring-marigold/30 size-2 rounded-full ring-4" />
      <span className="bg-ink/85 text-paper rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap backdrop-blur-sm">{label}</span>
    </span>
  );
}
