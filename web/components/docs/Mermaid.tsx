"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A Mermaid diagram, drawn in the browser in the site's colours. Mermaid is loaded only when a
 * diagram scrolls near the viewport, and redrawn when the theme changes. The source stays
 * available as text for anyone who can't see the drawing.
 */
export function Mermaid({ chart, title }: { chart: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: "400px" });
    io.observe(el);
    // Redraw on theme switches (manual toggle or OS change).
    const mo = new MutationObserver(() => setThemeKey((k) => k + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => setThemeKey((k) => k + 1);
    mql.addEventListener("change", onScheme);
    return () => {
      io.disconnect();
      mo.disconnect();
      mql.removeEventListener("change", onScheme);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const { default: mermaid } = await import("mermaid");
      const css = getComputedStyle(document.documentElement);
      const v = (name: string) => css.getPropertyValue(name).trim();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        // A concrete family name: Mermaid measures label text itself and can't resolve CSS var().
        fontFamily: getComputedStyle(document.body).fontFamily,
        // Natural size keeps text readable; wide diagrams scroll inside the figure instead of shrinking.
        flowchart: { useMaxWidth: false },
        sequence: { useMaxWidth: false, noteMargin: 8, messageMargin: 32 },
        state: { useMaxWidth: false },
        themeVariables: {
          background: v("--paper-raised"),
          primaryColor: v("--teal-soft"),
          primaryTextColor: v("--ink"),
          primaryBorderColor: v("--teal"),
          secondaryColor: v("--marigold-soft"),
          tertiaryColor: v("--paper-sunk"),
          lineColor: v("--ink-muted"),
          textColor: v("--ink"),
          noteBkgColor: v("--marigold-soft"),
          noteTextColor: v("--ink"),
          noteBorderColor: v("--marigold"),
          actorBkg: v("--teal-soft"),
          actorBorder: v("--teal"),
          actorTextColor: v("--ink"),
          signalColor: v("--ink"),
          signalTextColor: v("--ink"),
          labelBoxBkgColor: v("--paper-sunk"),
          labelTextColor: v("--ink"),
          fontSize: "15px",
        },
      });
      const { svg } = await mermaid.render(`m${id}${themeKey}`, chart);
      if (!cancelled) setSvg(svg);
    })().catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [visible, chart, id, themeKey]);

  return (
    <figure className="not-prose bg-paper-raised border-line my-8 overflow-hidden rounded-card border">
      {/* Focusable so keyboard users can scroll a wide diagram. */}
      <div ref={ref} tabIndex={0} className="min-h-40 overflow-x-auto p-5" role="img" aria-label={title}>
        {svg ? (
          <div className="mx-auto w-max" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <span className="text-ink-muted block pt-14 text-center text-sm">Drawing diagram…</span>
        )}
      </div>
      <figcaption className="border-line flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-sm">
        <span className="font-semibold">{title}</span>
        <details className="text-ink-muted w-full sm:w-auto">
          <summary className="min-h-11 cursor-pointer py-2">Diagram as text</summary>
          <pre className="bg-paper-sunk mt-2 overflow-x-auto rounded-lg p-3 text-xs">{chart.trim()}</pre>
        </details>
      </figcaption>
    </figure>
  );
}
