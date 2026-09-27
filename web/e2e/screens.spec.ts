// Visual check (not part of CI): phone-size screenshots of the main screens, from a real signed-in session.
// Run: SCREENS=1 npx playwright test e2e/screens.spec.ts   -> web/test-results/screens/*.png
import { expect, test } from "@playwright/test";

test.skip(!process.env.SCREENS, "set SCREENS=1 to capture screenshots");
test.setTimeout(420_000);

test("screens", async ({ browser }) => {
  // The marketing site on a desktop screen, with the 3D scene running.
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await desk.newPage();
  await dp.goto("/");
  await dp.waitForTimeout(3500);
  await dp.screenshot({ path: "test-results/screens/00-site-desktop.png" });
  await dp.screenshot({ path: "test-results/screens/00-site-desktop-full.png", fullPage: true });
  await desk.close();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
  });
  const shot = (name: string, fullPage = true) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage });

  await page.goto("/");
  await page.waitForTimeout(3000);
  await shot("01-landing", false);
  await page.getByRole("link", { name: "Start saving with your family" }).first().click();
  await shot("02-start");
  await page.getByPlaceholder("e.g. Priya").fill("Priya");
  await page.getByRole("button", { name: "Create my account with Face ID" }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.waitForTimeout(2500);
  await shot("03-home-empty");
  await page.getByRole("link", { name: "New circle" }).last().click();
  await page.getByRole("button", { name: "Demo: every 5 minutes" }).click();
  await page.getByRole("button", { name: "Fewer" }).click();
  await page.getByRole("button", { name: "Fewer" }).click(); // 3 people, so two joins start it
  await shot("04-create");
  await page.getByRole("button", { name: "Create circle" }).click();
  await expect(page.getByText("is ready")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2600);
  await shot("05-invite");
  const invite = (await page.getByTestId("invite-link").textContent())!.trim();
  await page.getByRole("link", { name: /Go to the circle/ }).click().catch(() => {});
  await page.waitForTimeout(3000);
  await shot("06-circle-forming");

  // Two people open the invite and join, so the circle goes live.
  for (let i = 0; i < 2; i++) {
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const gp = await guest.newPage();
    const gcdp = await guest.newCDPSession(gp);
    await gcdp.send("WebAuthn.enable");
    await gcdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
    });
    await gp.goto(invite);
    await expect(gp.getByTestId("circle-name")).toBeVisible();
    if (i === 0) await gp.screenshot({ path: "test-results/screens/07-join.png", fullPage: true });
    await gp.getByTestId("join").click();
    await expect(gp).toHaveURL(/\/circle\/0x/, { timeout: 90_000 });
    await guest.close();
  }
  await page.goto("/home");
  await expect(page.getByText(/Round \d of/).first()).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await shot("08-home-active");
  await page.getByTestId("circles").locator("a").first().click();
  await page.waitForTimeout(2500);
  await shot("09-circle-active");
  await page.goto("/settings");
  await page.waitForTimeout(1500);
  await shot("10-settings");
  await page.goto("/add-money");
  await page.waitForTimeout(2000);
  await shot("11-add-money");
});
