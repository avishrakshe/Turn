// Walks the app's main flows in demo mode and captures each key screen at 390px and 1440px,
// light and dark. Doubles as a smoke test: it fails loudly if a step can't be completed.
//   node scripts/screenshots-app.mjs <phase> [baseUrl]
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const [phase = "dev", base = "http://localhost:3000"] = process.argv.slice(2);
const outDir = new URL(`../../docs/screenshots/${phase}/`, import.meta.url);
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "390", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "1440", width: 1440, height: 900, deviceScaleFactor: 1 },
];

const browser = await chromium.launch();
const errors = [];

for (const vp of viewports) {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ ...vp, viewport: { width: vp.width, height: vp.height }, colorScheme: theme, reducedMotion: "reduce", timezoneId: "Asia/Kolkata", locale: "en-IN" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${vp.name}/${theme}: ${e.message}`));
    // Viewport shots, as a phone shows the screen: full-page captures misplace fixed elements
    // (tab bar, toasts). Toasts are dismissed first so they don't cover the screen.
    const shot = async (name, top = true) => {
      for (const b of await page.getByRole("button", { name: "Dismiss" }).all()) await b.click().catch(() => {});
      if (top) await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(450);
      const file = fileURLToPath(new URL(`app-${name}-${vp.name}-${theme}.png`, outDir));
      await page.screenshot({ path: file });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 0) console.warn(`WARN app-${name} @${vp.width}px overflows by ${overflow}px`);
    };
    const faceId = async () => {
      await page.getByRole("dialog").getByRole("button", { name: "Use Face ID" }).click();
      await page.waitForTimeout(1500);
    };

    // 1. Welcome
    await page.goto(`${base}/app`, { waitUntil: "load" });
    await page.getByRole("heading", { name: "Save together. Take turns." }).waitFor();
    await shot("1-welcome");

    // 2. Join via sample invite
    await page.getByRole("button", { name: "Try a sample invite" }).click();
    await page.getByRole("button", { name: "Join with Face ID" }).waitFor();
    await page.getByLabel("Your name").fill("Ravi");
    await shot("2-join");
    await page.getByRole("button", { name: "Join with Face ID" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Use Face ID" }).waitFor();
    await shot("3-faceid", false);
    await faceId();

    // 3. Circle detail, bid, reveal
    await page.getByRole("heading", { name: "Family Circle" }).waitFor();
    await shot("4-circle");
    await page.getByRole("button", { name: "Bid for this month's pot" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Seal my bid" }).waitFor();
    await shot("5-bid", false);
    await page.getByRole("dialog").getByRole("button", { name: "Seal my bid" }).click();
    await page.waitForTimeout(400);
    await page.getByText("Demo controls").click();
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "OK" }).waitFor();
    await page.waitForTimeout(2500);
    await shot("6-reveal", false);
    await page.getByRole("dialog").getByRole("button", { name: "OK" }).click();

    // 4. A missed payment, handled calmly
    const miss = page.getByRole("button", { name: /Make .* miss next month/ });
    await miss.click();
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    const ok = page.getByRole("dialog").getByRole("button", { name: "OK" });
    if (await ok.isVisible().catch(() => false)) {
      await page.waitForTimeout(2000);
      await ok.click();
    }
    await shot("7-missed");

    // 5. Home
    await page.goto(`${base}/app`, { waitUntil: "load" });
    await page.getByRole("heading", { name: "Your circles" }).waitFor();
    await shot("8-home");

    // 6. Create flow
    await page.getByRole("link", { name: "Start a circle" }).last().click();
    await page.getByRole("button", { name: /Emergency fund/ }).waitFor();
    await shot("9-create-template");
    await page.getByRole("button", { name: /Emergency fund/ }).click();
    await shot("10-create-amount");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await shot("11-create-review");
    await page.getByRole("button", { name: "Create with Face ID" }).click();
    await faceId();
    await page.getByRole("heading", { name: "Invite your people" }).waitFor();
    await shot("12-share");
    await page.getByRole("button", { name: "Fill the other seats with demo members" }).click();
    await page.getByRole("button", { name: "Swap turns" }).click();
    await page.getByRole("dialog").getByRole("radio").last().click();
    await shot("13-swap", false);
    await page.keyboard.press("Escape");

    // 7. Score and settings
    await page.goto(`${base}/app/score`, { waitUntil: "load" });
    await page.getByRole("button", { name: "Share my card" }).waitFor();
    await shot("14-score");
    await page.goto(`${base}/app/settings`, { waitUntil: "load" });
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    await shot("15-settings");

    await ctx.close();
    console.log(`done ${vp.name} ${theme}`);
  }
}
await browser.close();
if (errors.length) {
  console.error("page errors:\n" + errors.join("\n"));
  process.exit(1);
}
