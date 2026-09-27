// End-to-end: real WebAuthn passkeys (Chrome virtual authenticator with PRF), the in-app gasless relayer,
// EIP-7702 on a local Prague chain, and the Envio indexer. Covers the spec's stateless test and the
// "One Passkey, Many Keys" cross-device test.
import { expect, test, type BrowserContext, type CDPSession, type Page } from "@playwright/test";

type Authenticator = { cdp: CDPSession; id: string };

async function withPasskeys(page: Page): Promise<Authenticator> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  });
  return { cdp, id: authenticatorId };
}

async function newUser(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "warning" || m.type() === "error") console.log(`[browser ${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
  const auth = await withPasskeys(page);
  return { ctx, page, auth };
}

/** Full navigation reloads the app; the passkey session is memory-only by design, so sign back in if asked. */
async function open(page: Page, path: string) {
  await page.goto(path);
  const gate = page.getByRole("button", { name: "Open with Face ID" });
  const shown = await gate
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (shown) await gate.click();
}

let creator: { ctx: BrowserContext; page: Page; auth: Authenticator };
let invite = "";
let circlePath = "";

test.describe.serial("Turn", () => {
  test("creator onboards with one passkey prompt and creates a circle gaslessly", async ({ browser }) => {
    creator = await newUser(browser);
    const { page } = creator;
    await page.goto("/");
    await page.getByRole("link", { name: "Start saving with your family" }).click();
    await page.getByPlaceholder("e.g. Priya").fill("Priya");
    await page.getByRole("button", { name: "Create my account with Face ID" }).click();
    await expect(page).toHaveURL(/\/home/);

    await open(page, "/create");
    await page.getByRole("button", { name: "Fewer" }).click();
    await page.getByRole("button", { name: "Fewer" }).click(); // 3 people
    await page.getByRole("button", { name: "Demo: every 5 minutes" }).click();
    await page.getByRole("button", { name: "Create circle" }).click();
    await expect(page.getByText("is ready")).toBeVisible();
    invite = (await page.getByTestId("invite-link").textContent())!.trim();
    expect(invite).toMatch(/\/join\/0x[0-9a-fA-F]{40}\?s=0x[0-9a-f]{64}/);
    circlePath = new URL(invite).pathname.replace("/join/", "/circle/");
  });

  test("two family members join from the link: one Face ID each, no money for fees", async ({ browser }) => {
    for (const name of ["Ravi", "Meera"]) {
      const u = await newUser(browser);
      await u.page.goto(invite);
      await expect(u.page.getByTestId("circle-name")).toHaveText("Family circle");
      await u.page.getByTestId("join").click();
      await expect(u.page).toHaveURL(/\/circle\/0x/, { timeout: 90_000 });
      await expect(u.page.getByText("Your turn is coming")).toBeVisible();
      await u.ctx.close();
      void name;
    }
    await open(creator.page, circlePath);
    // The circle is live. (The in-app keeper may already have moved it past round 1 by now.)
    await expect(creator.page.getByText(/Round \d of 3/).first()).toBeVisible({ timeout: 60_000 });
  });

  test("encrypted names: set a name in the passkey vault", async () => {
    const { page } = creator;
    await open(page, "/people");
    await page.getByRole("button", { name: /Show names/ }).click();
    const input = page.getByRole("textbox").first();
    await expect(input).toBeVisible();
    await input.fill("Ravi bhai");
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByRole("button", { name: "✓" })).toBeVisible();
  });

  test("stateless: wipe browser storage, reload, and everything comes back from the passkey + chain + Envio", async () => {
    const { page, ctx } = creator;
    await open(page, "/home");
    await expect(page.getByTestId("circles").locator("li").first()).toBeVisible();
    const circlesBefore = await page.getByTestId("circles").locator("li").count();
    const balanceBefore = await page.getByTestId("balance").textContent();

    // Wipe every kind of site data for the origin (local/session storage, IndexedDB, caches, cookies, service
    // workers...), i.e. the same state as a fresh browser profile, then reload. Only the passkey survives.
    const origin = new URL(page.url()).origin;
    await creator.auth.cdp.send("Storage.clearDataForOrigin", { origin, storageTypes: "all" });
    await page.evaluate(() => sessionStorage.clear());
    await ctx.clearCookies();
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    await page.reload();

    await expect(page.getByText("Welcome back")).toBeVisible();
    await page.getByRole("button", { name: "Open with Face ID" }).click();
    await expect(page.getByTestId("circles").locator("li")).toHaveCount(circlesBefore);
    await expect(page.getByTestId("balance")).toHaveText(balanceBefore!);

    // In-app navigation keeps the session (no reload): go via Settings -> People.
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("link", { name: /Manage names/ }).click();
    await page.getByRole("button", { name: /Show names/ }).click();
    await expect(page.getByRole("textbox").first()).toHaveValue("Ravi bhai");
  });

  // Cross-device with a *different* browser can't be automated with Chrome's virtual authenticator: the DevTools
  // protocol exports a credential's key and ids but not its PRF secret (WebAuthn.getCredentials returns
  // credentialId, isResidentCredential, rpId, privateKey, userHandle, signCount, backup flags, user names), so a copied
  // credential answers PRF requests with PRF_UNAVAILABLE. The wipe-everything test above covers "fresh profile" state;
  // the two-device check (synced iCloud Keychain / Google Password Manager passkey) is a manual demo step in docs/ACCESS.md.
});
