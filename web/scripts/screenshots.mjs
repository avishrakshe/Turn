// Captures key pages at 390px (mobile) and 1440px (desktop) in light and dark mode.
// Usage: start the app (pnpm build && pnpm start), then:
//   node scripts/screenshots.mjs <phase> [baseUrl] [path ...]
// Output: docs/screenshots/<phase>/<page>-<width>-<theme>.png
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const [phase = "dev", base = "http://localhost:3000", ...paths] = process.argv.slice(2);
const pages = paths.length ? paths : ["/design"];
const outDir = new URL(`../../docs/screenshots/${phase}/`, import.meta.url);
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "390", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "1440", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

const browser = await chromium.launch();
for (const vp of viewports) {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ ...vp, viewport: { width: vp.width, height: vp.height }, colorScheme: theme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    for (const p of pages) {
      // "load" rather than "networkidle": Next keeps route prefetches open, which can stall idle detection.
      await page.goto(base + p, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) console.warn(`WARN ${p} @${vp.width}px overflows horizontally by ${overflow}px`);
      const slug = p === "/" ? "home" : p.replace(/^\//, "").replaceAll("/", "-");
      const file = fileURLToPath(new URL(`${slug}-${vp.name}-${theme}.png`, outDir));
      await page.screenshot({ path: file, fullPage: true });
      console.log("saved", file);
    }
    await ctx.close();
  }
}
await browser.close();
