"use client";

import { useEffect, useRef, useState } from "react";
import { avatarTone } from "@/components/ring/geometry";
import { TurnRing } from "@/components/ring/TurnRing";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { getSound } from "@/lib/sound";
import type { FilmScene, LabelAnchor } from "./film/scene";
import { buildFilm, type FlightKind, MEMBERS, POT, progressAt, SEATS, telemetry, timeAt } from "./film/timeline";

/**
 * "One circle, start to finish": a pinned stage where scrolling plays a year of a savings
 * circle on a 3D table at night. Scroll is time-warped (slow moments get more of it), the
 * telemetry reads the same film data as the picture, and with sound on a tanpura drone plays
 * only while the film moves. Numbers come from the economics engine the contracts follow.
 */

const film = buildFilm();
/** Scroll per unit of warped film time, in viewport heights. */
const VH_PER_UNIT = 11;
const NIGHT = "#120d0a";
const PHASES: Record<string, string> = {
  title: "Evening before",
  join: "Joining",
  collect: "Auto-pay",
  bids: "Bidding · sealed",
  reveal: "Bids opened",
  payout: "Payout",
  complete: "Complete",
  outro: "Complete",
};
const inr = (n: number) => formatMoney(Math.round(n), "INR");
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};

/** How hard the stage shakes: strongest as the pot lifts off at each payout. */
function ignition(t: number) {
  for (const b of film.beats) {
    if (b.phase !== "payout" || t < b.t0 || t > b.t1) continue;
    const u = (t - b.t0) / (b.t1 - b.t0);
    return smooth(0, 0.08, u) * (1 - smooth(0.3, 0.55, u)) * (b.month === 1 ? 1 : 0.6);
  }
  return 0;
}

/** Month starts, for the progress rail. */
const TICKS = [
  { label: "Join", t: film.beats.find((b) => b.phase === "join")!.t0 },
  ...Array.from({ length: film.months }, (_, i) => ({ label: String(i + 1), t: film.beats.find((b) => b.phase === "collect" && b.month === i + 1)!.t0 })),
  { label: "End", t: film.beats.find((b) => b.phase === "complete")!.t0 },
];

export function CircleFilm() {
  const runway = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const labels = useRef<Array<HTMLDivElement | null>>([]);
  const [gl, setGl] = useState<"loading" | "ready" | "failed">("loading");
  const [fallbackTurn, setFallbackTurn] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(false);

  useEffect(() => {
    const sound = getSound();
    setSoundOn(sound.on);
    const off = sound.subscribe(setSoundOn);
    // A returning visitor who chose sound gets it back on their first click or key press
    // (browsers don't allow audio to start any earlier).
    const resume = () => sound.saved() && !sound.on && sound.enable();
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => {
      off();
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, []);

  useEffect(() => {
    const el = runway.current;
    const cv = canvas.current;
    const root = hud.current;
    if (!el || !cv || !root) return;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    const ui = {
      month: q("[data-month]"),
      clock: q("[data-clock]"),
      phase: q("[data-phase]"),
      pot: q("[data-pot]"),
      paid: q("[data-paid]"),
      held: q("[data-held]"),
      reserve: q("[data-reserve]"),
      countdown: q("[data-countdown]"),
      countdownRow: q("[data-countdown-row]"),
      caption: q("[data-caption]"),
      title: q("[data-title]"),
      fill: q("[data-fill]"),
      ticks: Array.from(root.querySelectorAll<HTMLElement>("[data-tick]")),
      corners: Array.from(root.querySelectorAll<HTMLElement>("[data-corner]")),
    };
    const sound = getSound();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anchors: LabelAnchor[] = [];
    let scene: FilmScene | null = null;
    let loading = false;
    let disposed = false;
    let raf = 0;
    let visible = false;
    let t = timeAt(film, progress());
    let last = performance.now();
    let speed = 0;
    let lastCaption = "";
    let renderedT = -1;
    let renderedAt = 0;
    const lastText = new Map<Element, string>();
    const write = (node: Element, text: string) => {
      if (lastText.get(node) !== text) {
        lastText.set(node, text);
        node.textContent = text;
      }
    };

    function progress() {
      const r = el!.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      return span > 0 ? clamp01(-r.top / span) : 0;
    }

    async function load() {
      loading = true;
      try {
        const mod = await import("./film/scene");
        if (disposed) return;
        // Read from the section: the mono font's variable is set by the landing page, not :root.
        const css = getComputedStyle(el!);
        const v = (name: string) => css.getPropertyValue(name).trim();
        await document.fonts?.ready;
        if (disposed) return;
        scene = mod.createFilmScene(cv!, film, {
          reducedMotion: reduced,
          fonts: {
            sans: v("--font-dm-sans") || "sans-serif",
            display: v("--font-fraunces") || "serif",
            mono: v("--font-jetbrains") || "monospace",
          },
          // The stage is always night, so it uses the dark theme's marigold and teal.
          colors: {
            avatars: MEMBERS.map((m) => v(`--av-${avatarTone(m.name)}`) || "#f3c98b"),
            marigold: "#f2b441",
            teal: "#5fc4b4",
            ink: "#2b211a",
            cream: "#f4ebdf",
          },
        });
        setGl("ready");
      } catch {
        if (!disposed) setGl("failed");
      }
    }

    const statusCache: string[] = [];
    function statusOf(i: number, tt: number, tm: ReturnType<typeof telemetry>): string {
      for (const m of film.misses) if (m.member === i && tt > m.t0 && tt < m.t1 + 0.5) return "Missed · covered";
      const won = film.turns.find((tr) => tr.member === i && tr.month <= film.months && tt >= tr.t1);
      if (tm.turn === i && won && won.month === tm.month && tm.phase !== "collect") return `Turn · month ${won.month}`;
      if (tm.phase === "complete" || tm.phase === "outro") return "Paid in full";
      if (tm.phase === "bids" || tm.phase === "reveal") {
        const bid = film.bids.find((b) => b.member === i && b.month === tm.month);
        if (bid) return tm.phase === "bids" ? "Bid sealed" : `Bid ${bid.bps / 100}%`;
      }
      if (tm.phase === "collect") {
        const mine = film.flights.filter((f) => f.month === tm.month && f.member === i && (f.kind === "contribution" || f.kind === "cover") && !f.mote);
        if (mine.length && mine.every((f) => tt >= f.t1)) return "Paid ✓";
        if (mine.length) return "Paying…";
      }
      if (won) return `Had turn · M${won.month}`;
      return tm.month === 0 ? (tt > film.joins[i]! + 0.6 ? "Joined ✓" : "Joining…") : "Waiting";
    }

    function draw(now: number) {
      const tm = telemetry(film, t);
      write(ui.month, String(Math.min(Math.max(tm.month, 0), film.months)).padStart(2, "0"));
      write(ui.clock, tm.clock);
      write(ui.phase, PHASES[tm.phase] ?? "");
      write(ui.pot, inr(tm.pot));
      write(ui.paid, tm.month >= 1 && tm.month <= film.months ? `${tm.paid + tm.covered} / ${SEATS}${tm.covered ? ` · ${tm.covered} covered` : ""}` : "—");
      write(ui.held, inr(tm.held));
      write(ui.reserve, inr(tm.reserve));
      ui.countdownRow.hidden = !tm.countdown;
      if (tm.countdown) write(ui.countdown, tm.countdown);
      ui.phase.dataset.tone = tm.phase === "payout" ? "turn" : tm.phase === "bids" ? "sealed" : film.misses.some((m) => t > m.t0 && t < m.t1) ? "warn" : "";

      if (tm.caption !== lastCaption) {
        lastCaption = tm.caption;
        ui.caption.textContent = tm.caption;
        if (!reduced) ui.caption.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(0.22,1,0.36,1)" });
      }
      const title = 1 - smooth(0.9, 2.1, t);
      ui.title.style.opacity = String(title);
      ui.title.style.visibility = title < 0.01 ? "hidden" : "visible";
      for (const c of ui.corners) c.style.opacity = String(1 - title * 0.8);
      ui.fill.style.transform = `scaleX(${clamp01(t / film.duration)})`;
      ui.ticks.forEach((tick, k) => {
        const on = t >= TICKS[k]!.t && (k === TICKS.length - 1 || t < TICKS[k + 1]!.t);
        tick.dataset.state = on ? "on" : t >= TICKS[k]!.t ? "past" : "";
      });

      const shake = ignition(t) * clamp01(speed / 1.2);
      // At rest only the marker's breathing moves, so ten frames a second is plenty (and kind to batteries).
      const idle = Math.abs(t - renderedT) < 1e-4 && shake < 0.001;
      if (scene && (!idle || now - renderedAt > 100)) {
        renderedT = t;
        renderedAt = now;
        scene.render(t, shake, now);
        scene.anchors(anchors);
        const logo = smooth(film.beats.at(-1)!.t0 + 0.3, film.beats.at(-1)!.t0 + 1.2, t);
        for (let i = 0; i < SEATS; i++) {
          const node = labels.current[i];
          const a = anchors[i];
          if (!node || !a) continue;
          node.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${a.scale.toFixed(3)})`;
          node.style.opacity = String(a.alpha * (1 - logo));
          const status = statusOf(i, t, tm);
          if (statusCache[i] !== status) {
            statusCache[i] = status;
            const s = node.querySelector("[data-status]")!;
            s.textContent = status;
            node.dataset.tone = status.startsWith("Missed") ? "warn" : status.startsWith("Turn") ? "turn" : status.startsWith("Paid") || status.startsWith("Joined") ? "ok" : "";
          }
        }
      } else if (!scene) {
        // No 3D (yet, or at all): the flat ring stands in, following whose turn it is.
        setFallbackTurn((prev) => (prev === tm.turn ? prev : tm.turn));
      }
    }

    // Coins landing, the pot lifting, bids opening: sound cues, fired only when playing forward.
    function cues(from: number, to: number, velocity: number) {
      if (!sound.on) return;
      let clinks = 0;
      for (const f of film.flights) {
        if (f.mote || f.t1 <= from || f.t1 > to || clinks >= 3) continue;
        const loud: Partial<Record<FlightKind, number>> = { contribution: 1, cover: 0.7, payout: 1.2, withheld: 0.8, release: 0.9, claim: 1, deposit: 0.9, discount: 1 };
        if (!(f.kind in loud)) continue;
        const a = anchors[f.member];
        const w = cv!.clientWidth || 1;
        sound.clink(a ? (a.x / w) * 2 - 1 : 0, f.to === POT ? 0.8 : loud[f.kind]!);
        clinks++;
      }
      for (const b of film.beats) {
        if (b.t0 <= from || b.t0 > to) continue;
        const hard = Math.min(1, 0.35 + Math.abs(velocity) / 3);
        if (b.phase === "payout") {
          sound.thump(hard);
          sound.whoosh(hard);
        }
        if (b.phase === "reveal") sound.chime("reveal");
        if (b.phase === "complete") sound.chime("complete");
      }
      for (const m of film.misses) if (m.t0 > from && m.t0 <= to) sound.chime("miss");
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      // Real elapsed time (capped, for a tab coming back from the background), so a slow device
      // keeps up with the scroll and the drone still settles to silence promptly.
      const step = Math.min(0.25, Math.max(0.001, (now - last) / 1000));
      last = now;
      const target = timeAt(film, progress());
      // Ease toward the scroll position, so scrubbing feels like film rather than a slider.
      const prev = t;
      t += (target - t) * (1 - Math.exp(-step * (reduced ? 40 : 7)));
      if (Math.abs(target - t) < 1e-4) t = target;
      const velocity = (t - prev) / step;
      speed += (Math.abs(velocity) - speed) * (1 - Math.exp(-step * 5));
      if (t > prev) cues(prev, t, velocity);
      sound.motion(speed < 0.08 ? 0 : speed / 2);
      draw(now);

      // While the night stage sits under the nav, the nav goes dark with it.
      const r = el!.getBoundingClientRect();
      const night = r.top <= 64 && r.bottom >= 64;
      if (night !== (document.documentElement.dataset.night === "true")) {
        if (night) document.documentElement.dataset.night = "true";
        else delete document.documentElement.dataset.night;
      }
    }

    function start() {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      sound.motion(0);
      delete document.documentElement.dataset.night;
    }

    const io = new IntersectionObserver(
      ([e]) => {
        visible = !!e?.isIntersecting;
        if (visible) {
          if (!scene && !loading) void load();
          start();
        } else stop();
      },
      // Start loading the 3D scene a screen before it arrives.
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    const ro = new ResizeObserver(() => {
      scene?.resize();
      renderedT = -1; // resizing clears the canvas: draw again on the next frame
    });
    ro.observe(cv);
    const onVisibility = () => (document.hidden ? stop() : visible && start());
    document.addEventListener("visibilitychange", onVisibility);
    draw(performance.now());

    return () => {
      disposed = true;
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      scene?.dispose();
    };
  }, []);

  function jump(k: number) {
    const el = runway.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    // Land just inside the month so its first caption is showing.
    window.scrollTo({ top: top + progressAt(film, TICKS[k]!.t + 0.05) * span, behavior: "smooth" });
  }

  function toggleSound() {
    getSound().toggle();
  }

  const scroll = (film.totalWeight * VH_PER_UNIT).toFixed(0);

  return (
    <section id="film" aria-labelledby="film-title" className="relative">
      {/* Dusk: the page's paper fades into the night the film is set in. */}
      <div aria-hidden className="film-dusk h-[45vh]" />
      <div ref={runway} className="relative" style={{ height: `calc(${scroll}vh + 100svh)`, background: NIGHT }}>
        <div className="film-stage sticky top-0 h-svh overflow-hidden" style={{ background: NIGHT }}>
          <canvas ref={canvas} aria-hidden className={cn("absolute inset-0 size-full transition-opacity duration-700", gl === "ready" ? "opacity-100" : "opacity-0")} />

          {gl === "failed" && (
            <div className="absolute inset-0 grid place-items-center p-10">
              <TurnRing
                members={MEMBERS.map((m) => ({ name: m.name }))}
                step={fallbackTurn ?? 0}
                marker={fallbackTurn !== null}
                label="A savings circle of six"
                className="max-w-[min(70vw,420px)] opacity-90"
              />
            </div>
          )}
          {gl === "loading" && (
            <p className="font-mono absolute inset-x-0 top-1/2 text-center text-xs tracking-[0.2em] text-[#8f8071] uppercase">Setting the table…</p>
          )}

          <div ref={hud} className="film-hud absolute inset-0">
            {/* Labels anchored to each member's token. */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {MEMBERS.map((m, i) => (
                <div
                  key={m.id}
                  ref={(n) => {
                    labels.current[i] = n;
                  }}
                  className="film-label absolute top-0 left-0 opacity-0"
                >
                  <span className="block text-[13px] leading-tight font-semibold">{m.name.split(" ")[0]}</span>
                  <span data-status className="font-mono block text-[9.5px] tracking-[0.12em] uppercase" />
                </div>
              ))}
            </div>

            {/* Title card, fades as the film starts. */}
            <div data-title className="pointer-events-none absolute inset-x-0 top-[30%] px-6 text-center sm:top-[22%]">
              <p className="font-mono text-[11px] tracking-[0.24em] text-[#f4be5a] uppercase">A circle of six · ₹5,000 a month</p>
              <h2 id="film-title" className="mx-auto mt-4 max-w-3xl text-4xl text-[#f4ebdf] sm:text-6xl">
                One circle, start to finish.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[#bdae9e] sm:text-lg">Scroll to run it, month by month. Every number comes from the rules real circles run on.</p>
              <p aria-hidden className="font-mono mt-8 text-[11px] tracking-[0.24em] text-[#8f8071] uppercase motion-safe:animate-pulse">Scroll ↓</p>
            </div>

            {/* Telemetry: read from the same film time as the picture. */}
            <div aria-hidden data-corner className="font-mono pointer-events-none absolute start-4 top-20 text-[#f4ebdf] sm:start-8 sm:top-24">
              <p className="flex items-center gap-2 text-[10px] tracking-[0.2em] text-[#f4be5a] uppercase sm:text-[11px]">
                <span className="size-1.5 rounded-full bg-[#f2b441] motion-safe:animate-pulse" />
                Live simulation
              </p>
              <p className="mt-2 text-xl tracking-[0.06em] sm:text-3xl">
                MONTH <span data-month>00</span>
                <span className="text-[#8f8071]"> / {String(film.months).padStart(2, "0")}</span>
              </p>
              <p data-clock className="mt-1 text-[10px] tracking-[0.08em] text-[#bdae9e] sm:text-xs" />
              <p data-phase className="film-chip mt-3 inline-block rounded-full border px-2.5 py-1 text-[10px] tracking-[0.16em] uppercase sm:text-[11px]" />
            </div>

            <dl aria-hidden data-corner className="font-mono pointer-events-none absolute end-4 top-20 grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-end text-[10px] tracking-[0.08em] text-[#bdae9e] uppercase sm:end-8 sm:top-24 sm:gap-x-5 sm:gap-y-1.5 sm:text-xs">
              <dt>Pot</dt>
              <dd data-pot className="text-[#f4be5a] tabular-nums" />
              <dt>Paid in</dt>
              <dd data-paid className="text-[#f4ebdf] tabular-nums" />
              <dt>Held for safety</dt>
              <dd data-held className="text-[#6fcbbc] tabular-nums" />
              <dt>Reserve</dt>
              <dd data-reserve className="text-[#6fcbbc] tabular-nums" />
              <div data-countdown-row hidden className="contents">
                <dt>Bids close in</dt>
                <dd data-countdown className="text-[#f4ebdf] tabular-nums" />
              </div>
            </dl>

            {/* Caption. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-5 sm:bottom-28">
              <p aria-hidden data-caption className="film-caption max-w-2xl rounded-2xl px-4 py-3 text-center text-[15px] leading-relaxed text-[#f4ebdf] sm:text-lg" />
            </div>

            {/* Progress rail: jump to a month. */}
            <div className="absolute inset-x-4 bottom-6 flex items-end gap-3 sm:inset-x-8 sm:bottom-8">
              <nav aria-label="Film chapters" className="min-w-0 flex-1">
                <div className="relative h-px bg-white/15">
                  <div data-fill className="absolute inset-y-0 start-0 w-full origin-left bg-[#f2b441] rtl:origin-right" style={{ transform: "scaleX(0)" }} />
                </div>
                <ol className="mt-2 flex justify-between">
                  {TICKS.map((tick, k) => (
                    <li key={tick.label}>
                      <button
                        type="button"
                        data-tick
                        onClick={() => jump(k)}
                        className="film-tick font-mono inline-flex min-h-9 min-w-8 items-center justify-center rounded-full px-1 text-[10px] tracking-[0.1em] uppercase sm:min-w-9 sm:px-1.5 sm:text-[11px]"
                        aria-label={k === 0 ? "Jump to the start of the film" : k === TICKS.length - 1 ? "Jump to the end of the circle" : `Jump to month ${tick.label}`}
                      >
                        {tick.label}
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
              <button
                type="button"
                onClick={toggleSound}
                aria-pressed={soundOn}
                aria-label="Sound"
                className="font-mono inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-white/15 px-3 text-[10px] tracking-[0.14em] text-[#f4ebdf] uppercase hover:border-white/35 sm:text-[11px]"
              >
                <SoundBars on={soundOn} />
                {/* On phones the bars alone show it. */}
                <span aria-hidden className="hidden sm:inline">
                  Sound {soundOn ? "on" : "off"}
                </span>
              </button>
              <a href="#how" className="font-mono hidden min-h-11 shrink-0 items-center rounded-full px-2 text-[10px] tracking-[0.14em] text-[#bdae9e] uppercase hover:text-[#f4ebdf] sm:inline-flex sm:text-[11px]">
                Skip ↓
              </a>
            </div>
          </div>
        </div>
      </div>
      {/* Dawn: back to paper for the chapters. */}
      <div aria-hidden className="film-dawn h-[45vh]" />

      {/* The whole film in words, for screen readers. */}
      <ol className="sr-only">
        {film.transcript.map((line, i) => (
          // Some months read the same ("Nobody bids this month"), so the index is the key.
          <li key={i}>{line}</li>
        ))}
      </ol>
    </section>
  );
}

function SoundBars({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("film-bars flex h-3 items-end gap-[2px]", on && "is-on")}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="w-[2px] rounded-full bg-current" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}
