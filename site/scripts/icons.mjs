// Renders the installable app icons from the Turn mark. Run: node scripts/icons.mjs
//   public/icons/icon-192.png, icon-512.png   rounded tile ("any"), for desktop installs
//   public/icons/maskable-512.png             full bleed, mark inside the 80% safe zone (Android)
//   app/apple-icon.png                        180px full bleed; iOS rounds the corners itself
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const TEAL = "#0e5c55";
const PAPER = "#fbf6ee";
const MARIGOLD = "#eea722";

/** The mark: a faint ring with six seats, the current turn in marigold. `scale` sizes it inside the tile. */
function svg(size, { scale, radius }) {
  const seats = [0, 60, 120, 180, 240, 300].map((deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: 16 + 10 * Math.cos(a), y: 16 + 10 * Math.sin(a), current: deg === 60 };
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${radius}" fill="${TEAL}"/>
  <g transform="translate(16 16) scale(${scale}) translate(-16 -16)">
    <circle cx="16" cy="16" r="10" fill="none" stroke="${PAPER}" stroke-opacity=".35" stroke-width="1.4"/>
    ${seats
      .map((s) =>
        s.current
          ? `<circle cx="${s.x}" cy="${s.y}" r="4.2" fill="${MARIGOLD}" stroke="${TEAL}" stroke-width="1.2"/>`
          : `<circle cx="${s.x}" cy="${s.y}" r="2.5" fill="${PAPER}"/>`,
      )
      .join("\n    ")}
  </g>
</svg>`;
}

const out = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
mkdirSync(out("public/icons"), { recursive: true });

const icons = [
  { file: "public/icons/icon-192.png", size: 192, scale: 0.78, radius: 7 },
  { file: "public/icons/icon-512.png", size: 512, scale: 0.78, radius: 7 },
  { file: "public/icons/maskable-512.png", size: 512, scale: 0.62, radius: 0 },
  { file: "app/apple-icon.png", size: 180, scale: 0.7, radius: 0 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const i of icons) {
  await page.setViewportSize({ width: i.size, height: i.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(i.size, i)}</body></html>`);
  await page.locator("svg").screenshot({ path: out(i.file), omitBackground: true });
  console.log(`wrote ${i.file}`);
}
await browser.close();
