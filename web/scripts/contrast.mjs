// Checks WCAG 2.2 contrast for every text/background pair the design system uses,
// in both themes. Exits non-zero if any pair fails. Run: pnpm --filter @turn/web contrast
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");

function block(selector) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing block ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed block ${selector}`);
}

function vars(text) {
  const out = {};
  for (const m of text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2];
  return out;
}

const light = vars(block(":root {"));
const dark = vars(block(':root[data-theme="dark"]'));
const darkMedia = vars(block(':root:not([data-theme="light"])'));
for (const k of Object.keys(dark)) {
  if (dark[k] !== darkMedia[k]) throw new Error(`dark blocks disagree on --${k}`);
}

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum]. 4.5 = body text, 3 = large text / UI components.
const surfaces = ["paper", "paper-raised", "paper-sunk"];
const pairs = [
  ...surfaces.flatMap((s) => [
    ["ink", s, 4.5],
    ["ink-muted", s, 4.5],
    ["marigold-ink", s, 4.5],
    ["teal-ink", s, 4.5],
    ["success", s, 4.5],
    ["warning", s, 4.5],
    ["danger", s, 4.5],
    ["line-strong", s, 1.5],
    ["focus", s, 3],
  ]),
  ["ink-faint", "paper", 3],
  ["on-marigold", "marigold", 4.5],
  ["on-marigold", "marigold-hover", 4.5],
  ["on-teal", "teal", 4.5],
  ["on-teal", "teal-hover", 4.5],
  ["marigold-ink", "marigold-soft", 4.5],
  ["teal-ink", "teal-soft", 4.5],
  ["success", "success-soft", 4.5],
  ["warning", "warning-soft", 4.5],
  ["danger", "danger-soft", 4.5],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => ["#2b211a", `av-${i}`, 4.5]),
];

let failed = 0;
for (const [theme, t] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg, min] of pairs) {
    const f = fg.startsWith("#") ? fg : t[fg];
    const b = t[bg];
    if (!f || !b) throw new Error(`${theme}: missing --${fg} or --${bg}`);
    const r = ratio(f, b);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${theme.padEnd(5)} ${fg.padEnd(13)} on ${bg.padEnd(14)} ${r.toFixed(2)} (min ${min})`);
  }
}
if (failed) {
  console.error(`\n${failed} pair(s) below target`);
  process.exit(1);
}
console.log("\nall pairs pass");
