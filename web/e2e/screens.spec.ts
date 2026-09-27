// Visual check (not part of CI): phone-size screenshots of the main screens, from a real signed-in session.
// Run: SCREENS=1 npx playwright test e2e/screens.spec.ts   -> web/test-results/screens/*.png
import { expect, test } from "@playwright/test";

test.skip(!process.env.SCREENS, "set SCREENS=1 to capture screenshots");

test("screens", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
  });
  const shot = (name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

  await page.goto("/");
  await shot("01-landing");
  await page.getByRole("link", { name: "Start saving with your family" }).click();
  await shot("02-start");
  await page.getByPlaceholder("e.g. Priya").fill("Priya");
  await page.getByRole("button", { name: "Create my account with Face ID" }).click();
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByTestId("balance")).not.toHaveText("…");
  await shot("03-home-empty");
  await page.getByRole("link", { name: "New circle" }).click();
  await page.getByRole("button", { name: "Demo: every 5 minutes" }).click();
  await shot("04-create");
  await page.getByRole("button", { name: "Create circle" }).click();
  await expect(page.getByText("is ready")).toBeVisible({ timeout: 60_000 });
  await shot("05-invite");
  const invite = (await page.getByTestId("invite-link").textContent())!.trim();
  await page.getByRole("link", { name: /Go to the circle/ }).click().catch(() => {});
  await page.waitForTimeout(3000);
  await shot("06-circle-forming");
  // A second person opens the invite (not signed in)
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const gp = await guest.newPage();
  await gp.goto(invite);
  await expect(gp.getByTestId("circle-name")).toBeVisible();
  await gp.screenshot({ path: "test-results/screens/07-join.png", fullPage: true });
  await page.goto("/stats");
  await page.waitForTimeout(2000);
  await shot("08-stats");
});
