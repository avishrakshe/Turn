"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * The live background: rings of member seats on tilted orbits, a marigold light passing seat to
 * seat on each ring (whose turn it is), and now and then a coin of light flowing into the centre
 * (the pot). Soft warm glows drift behind it all.
 *
 * One canvas, no dependencies. It pauses when off-screen or in a background tab, caps its frame
 * rate and pixel density, takes its colours from the theme tokens, and draws a single still frame
 * when the visitor prefers reduced motion.
 */
const WIDE_FOCUS = { x: 0.72, y: 0.5 };
const NARROW_FOCUS = { x: 0.5, y: 0.66 };

export function OrbitField({ className, focus = WIDE_FOCUS, mobileFocus = NARROW_FOCUS }: {
  className?: string;
  /** Where the orbits centre, as a fraction of the canvas, on wide screens. */
  focus?: { x: number; y: number };
  mobileFocus?: { x: number; y: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let palette = readPalette();
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let last = 0;
    let t = 0;

    // --- scene ---------------------------------------------------------------
    const ORBITS = [0, 1, 2, 3, 4].map((i) => ({
      scale: 0.62 + i * 0.3,
      seats: 7 + i * 3,
      speed: 0.07 / (1 + i * 0.55), // seats drift slowly
      comet: 0.42 / (1 + i * 0.35), // the light moves faster than the seats
      phase: i * 1.7,
      glow: new Float32Array(7 + i * 3),
    }));
    const TILT = (-14 * Math.PI) / 180;
    const SQUASH = 0.42;
    const coins: Array<{ orbit: number; seat: number; t: number }> = [];
    let nextCoin = 1.2;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function center() {
      const f = w >= 1024 ? focus : mobileFocus;
      return { cx: w * f.x, cy: h * f.y, base: Math.min(w, h) * (w >= 1024 ? 0.38 : 0.46) };
    }

    // Point on a tilted ellipse, plus depth (-1 back … 1 front) for size and brightness.
    function onOrbit(cx: number, cy: number, r: number, a: number) {
      const x = r * Math.cos(a);
      const y = r * SQUASH * Math.sin(a);
      return {
        x: cx + x * Math.cos(TILT) - y * Math.sin(TILT),
        y: cy + x * Math.sin(TILT) + y * Math.cos(TILT),
        depth: Math.sin(a),
      };
    }

    function draw(dt: number) {
      const p = palette;
      const { cx, cy, base } = center();
      ctx!.clearRect(0, 0, w, h);

      // Drifting glows.
      const blobs = [
        { c: p.marigold, a: p.dark ? 0.16 : 0.34, x: 0.5 + 0.28 * Math.sin(t * 0.05), y: 0.45 + 0.2 * Math.cos(t * 0.04), r: 0.55 },
        { c: p.teal, a: p.dark ? 0.12 : 0.2, x: 0.78 + 0.18 * Math.cos(t * 0.035), y: 0.6 + 0.22 * Math.sin(t * 0.045), r: 0.5 },
        { c: p.rose, a: p.dark ? 0.08 : 0.18, x: 0.25 + 0.2 * Math.sin(t * 0.03 + 2), y: 0.3 + 0.18 * Math.cos(t * 0.05 + 1), r: 0.45 },
      ];
      for (const b of blobs) {
        const gx = b.x * w;
        const gy = b.y * h;
        const gr = b.r * Math.max(w, h);
        const g = ctx!.createRadialGradient(gx, gy, 0, gx, gy, gr);
        g.addColorStop(0, rgba(b.c, b.a));
        g.addColorStop(1, rgba(b.c, 0));
        ctx!.fillStyle = g;
        ctx!.fillRect(0, 0, w, h);
      }

      // Orbits, back half first so the front half overlaps it.
      ctx!.lineWidth = 1;
      for (const o of ORBITS) {
        const r = base * o.scale;
        ctx!.beginPath();
        ctx!.ellipse(cx, cy, r, r * SQUASH, TILT, 0, Math.PI * 2);
        ctx!.strokeStyle = rgba(p.line, p.dark ? 0.28 : 0.45);
        ctx!.stroke();
      }

      for (let oi = 0; oi < ORBITS.length; oi++) {
        const o = ORBITS[oi]!;
        const r = base * o.scale;
        const spin = o.phase + t * o.speed;
        const comet = o.phase * 2 + t * o.comet;

        // The light and its trail.
        const TRAIL = 22;
        for (let k = TRAIL; k >= 0; k--) {
          const a = comet - k * 0.045;
          const q = onOrbit(cx, cy, r, a);
          const fade = 1 - k / TRAIL;
          ctx!.beginPath();
          ctx!.arc(q.x, q.y, (1.2 + fade * 2.4) * (1 + q.depth * 0.25), 0, Math.PI * 2);
          ctx!.fillStyle = rgba(p.marigold, fade * fade * (p.dark ? 0.9 : 0.85));
          ctx!.fill();
        }

        // Seats: they glow as the light passes them.
        for (let s = 0; s < o.seats; s++) {
          const a = spin + (s / o.seats) * Math.PI * 2;
          const diff = Math.abs(Math.atan2(Math.sin(comet - a), Math.cos(comet - a)));
          if (diff < 0.08) o.glow[s] = 1;
          o.glow[s] = Math.max(0, o.glow[s]! - dt * 0.9);
          const q = onOrbit(cx, cy, r, a);
          const size = (2.3 + oi * 0.25) * (1 + q.depth * 0.35);
          const g = o.glow[s]!;
          if (g > 0.02) {
            ctx!.beginPath();
            ctx!.arc(q.x, q.y, size * (2.2 + g * 2.5), 0, Math.PI * 2);
            ctx!.fillStyle = rgba(p.marigold, g * 0.22);
            ctx!.fill();
          }
          ctx!.beginPath();
          ctx!.arc(q.x, q.y, size, 0, Math.PI * 2);
          ctx!.fillStyle = g > 0.02 ? mix(p.seat, p.marigold, g) : rgba(p.seat, 0.45 + q.depth * 0.25);
          ctx!.fill();
        }
      }

      // Now and then, the pot: a coin of light flows from an outer seat into the centre.
      nextCoin -= dt;
      if (nextCoin <= 0) {
        coins.push({ orbit: 2 + Math.floor(Math.random() * 3), seat: Math.floor(Math.random() * 9), t: 0 });
        nextCoin = 2.2 + Math.random() * 2;
      }
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i]!;
        c.t += dt / 2.4;
        if (c.t >= 1) {
          coins.splice(i, 1);
          continue;
        }
        const o = ORBITS[c.orbit]!;
        const start = onOrbit(cx, cy, base * o.scale, o.phase + t * o.speed + (c.seat / o.seats) * Math.PI * 2);
        const e = 1 - (1 - c.t) ** 3; // ease out
        const bend = Math.sin(e * Math.PI) * base * 0.18;
        const x = start.x + (cx - start.x) * e + bend * 0.4;
        const y = start.y + (cy - start.y) * e - bend;
        const alpha = Math.sin(c.t * Math.PI);
        const g = ctx!.createRadialGradient(x, y, 0, x, y, 14);
        g.addColorStop(0, rgba(p.marigold, 0.55 * alpha));
        g.addColorStop(1, rgba(p.marigold, 0));
        ctx!.fillStyle = g;
        ctx!.fillRect(x - 14, y - 14, 28, 28);
        ctx!.beginPath();
        ctx!.arc(x, y, 3, 0, Math.PI * 2);
        ctx!.fillStyle = rgba(p.marigold, alpha);
        ctx!.fill();
      }
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      const elapsed = now - last;
      if (elapsed < 1000 / 40) return; // ~40 fps is plenty for slow motion
      const dt = Math.min(elapsed / 1000, 0.1);
      last = now;
      t += dt;
      draw(dt);
    }

    function start() {
      cancelAnimationFrame(raf);
      resize();
      if (reduced.matches) {
        t = 12; // a composed still frame
        draw(0);
      } else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced.matches) draw(0);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
    });
    io.observe(canvas);
    const onTheme = () => {
      palette = readPalette();
      if (reduced.matches) draw(0);
    };
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", onTheme);
    reduced.addEventListener("change", start);
    start();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      scheme.removeEventListener("change", onTheme);
      reduced.removeEventListener("change", start);
    };
    // Depend on the numbers, not the objects, so a parent re-render never restarts the animation.
  }, [focus.x, focus.y, mobileFocus.x, mobileFocus.y]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)} />;
}

// --- colour helpers ---------------------------------------------------------

type RGB = [number, number, number];

function readPalette() {
  const css = getComputedStyle(document.documentElement);
  const hex = (name: string): RGB => {
    const v = css.getPropertyValue(name).trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(v);
    const n = m ? parseInt(m[1]!, 16) : 0x888888;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const paper = hex("--paper");
  return {
    dark: paper[0] + paper[1] + paper[2] < 200,
    marigold: hex("--marigold"),
    teal: hex("--teal"),
    rose: hex("--av-3"),
    line: hex("--line-strong"),
    seat: hex("--ink-faint"),
  };
}

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;

function mix(a: RGB, b: RGB, k: number) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}
