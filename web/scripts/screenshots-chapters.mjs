// Viewport captures of the landing page's sticky "how it works" chapters at 1440px, where
// full-page screenshots can't show the sticky phone. Usage:
//   node scripts/screenshots-chapters.mjs <phase> [baseUrl]
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const [phase = "dev", base = "http://localhost:3000"] = process.argv.slice(2);
const outDir = new URL(`../../docs/screenshots/${phase}/`, import.meta.url);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
  await page.goto(base + "/", { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  for (const id of ["join", "pay", "your-turn", "protected"]) {
    await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: "center" }), id);
    await page.waitForTimeout(600);
    const file = fileURLToPath(new URL(`chapter-${id}-1440-${theme}.png`, outDir));
    await page.screenshot({ path: file });
    console.log("saved", file);
  }
  await page.close();
}
await browser.close();
