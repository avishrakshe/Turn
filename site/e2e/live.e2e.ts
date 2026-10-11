// The live app, end to end on Monad testnet, with real WebAuthn passkeys (Chrome's virtual authenticator with PRF).
// Every WebAuthn ceremony is counted from the authenticator's own events, so "one Face ID" is measured, not assumed.
//
//  1. A brand-new account starts a circle: one passkey prompt, zero MON, first transaction confirmed onchain.
//  2. A second new person joins from the invite link: again one prompt and zero MON.
//  3. Stateless: wipe all site data, reload, one prompt, and circles + balance + names come back from the passkey,
//     the chain and the Envio indexer.
import { expect, test, type Browser, type BrowserContext, type CDPSession, type Page } from "@playwright/test";

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";

type User = { ctx: BrowserContext; page: Page; cdp: CDPSession; ceremonies: { created: number; asserted: number } };

async function newUser(browser: Browser): Promise<User> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
  // Proof for the write-up: every sponsored transaction the relayer submits.
  page.on("response", async (r) => {
    if (!r.url().endsWith("/v1/relay")) return;
    const body = (await r.json().catch(() => null)) as { ok?: boolean; txHash?: string } | null;
    if (body?.txHash) console.log(`[tx] ${body.txHash}`);
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
  });
  const ceremonies = { created: 0, asserted: 0 };
  cdp.on("WebAuthn.credentialAdded", () => ceremonies.created++);
  cdp.on("WebAuthn.credentialAsserted", () => ceremonies.asserted++);
  return { ctx, page, cdp, ceremonies };
}

async function monBalance(address: string): Promise<bigint> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
  });
  return BigInt(((await res.json()) as { result: string }).result);
}

const addressOf = (page: Page) => page.evaluate(() => sessionStorage.getItem("turn.address"));

let creator: User;
let joiner: User;
let joinerAddress = "";
let invite = "";
let circlePath = "";

test.describe.serial("Turn live app (Monad testnet)", () => {
  test("a new account starts a circle with one passkey prompt and no MON", async ({ browser }) => {
    creator = await newUser(browser);
    const { page } = creator;
    await page.goto("/app");
    await page.getByLabel("What should we call you?").fill("Priya");
    await page.getByRole("button", { name: "Create my account with Face ID" }).click();
    await expect(page.getByTestId("balance")).toBeVisible();
    const me = (await addressOf(page))!;
    expect(me).toMatch(/^0x[0-9a-fA-F]{40}$/);
    console.log(`[account] ${me}`);
    expect(await monBalance(me)).toBe(0n);

    await page.getByRole("link", { name: "Start a circle" }).first().click();
    await page.getByRole("button", { name: /Custom/ }).click();
    await page.getByLabel(/Each person pays/).fill("20");
    await page.getByRole("button", { name: "One fewer person" }).click();
    await page.getByRole("button", { name: "One fewer person" }).click(); // 3 people
    await page.getByRole("radio", { name: "Every 5 min" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Circle name").fill("Family circle");
    await page.getByRole("button", { name: "Create with Face ID" }).click();

    await expect(page).toHaveURL(/\/app\/circle\/0x[0-9a-fA-F]{40}/, { timeout: 90_000 });
    circlePath = new URL(page.url()).pathname;
    console.log(`[circle] ${circlePath}`);
    await expect(page.getByTestId("invite-link")).toBeVisible();
    invite = (await page.getByTestId("invite-link").textContent())!.trim();
    expect(invite).toMatch(/\/app\/join\/0x[0-9a-fA-F]{40}\?s=0x[0-9a-f]{64}/);

    // One ceremony in total (passkey creation, which also evaluated PRF), and still no MON: the relayer paid.
    expect(creator.ceremonies).toEqual({ created: 1, asserted: 0 });
    expect(await monBalance(me)).toBe(0n);
  });

  test("a second new person joins from the link with one passkey prompt and no MON", async ({ browser }) => {
    const u = (joiner = await newUser(browser));
    await u.page.goto(invite);
    await expect(u.page.getByTestId("circle-name")).toHaveText("Family circle");
    await u.page.getByLabel("Your name").fill("Ravi");
    await u.page.getByTestId("join").click();
    await expect(u.page).toHaveURL(/\/app\/circle\/0x/, { timeout: 90_000 });
    expect(u.ceremonies).toEqual({ created: 1, asserted: 0 });
    joinerAddress = (await addressOf(u.page))!;
    expect(await monBalance(joinerAddress)).toBe(0n);
  });

  test("stateless: wipe everything, reload, and it all comes back from passkey + chain + Envio", async () => {
    const { page, cdp, ctx } = creator;
    await page.goto("/app");
    await expect(page.getByTestId("circles").locator("li").first()).toBeVisible();
    const circles = await page.getByTestId("circles").locator("li").count();
    const balance = await page.getByTestId("balance").textContent();
    const before = { ...creator.ceremonies };

    // Same state as a fresh browser profile: only the passkey (on the authenticator) survives.
    const origin = new URL(page.url()).origin;
    await cdp.send("Storage.clearDataForOrigin", { origin, storageTypes: "all" });
    await page.evaluate(() => sessionStorage.clear());
    await ctx.clearCookies();
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    await page.reload();

    await page.getByRole("button", { name: "I already use Turn" }).click();
    await expect(page.getByTestId("circles").locator("li")).toHaveCount(circles);
    await expect(page.getByTestId("balance")).toHaveText(balance!);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi, Priya"); // name from the encrypted vault
    expect(creator.ceremonies.asserted - before.asserted).toBe(1);

    // In-app navigation keeps the session; the invite link is rebuilt from the passkey, not from storage.
    await page.locator(`a[href="${circlePath}"]`).click();
    await expect(page.getByTestId("invite-link")).toHaveText(invite);
    expect(creator.ceremonies.asserted - before.asserted).toBe(1);
  });

  test("AUSD: send money to a circle member, who sees it arrive (balance shown in local currency and AUSD)", async () => {
    const { page } = creator;
    // In-app navigation from the circle page keeps the session open.
    await page.getByRole("link", { name: "Home" }).first().click();
    await expect(page.getByTestId("ausd-balance")).toContainText("AUSD");
    await page.getByRole("link", { name: "Send money" }).click();
    await page.getByTestId("send-people").getByRole("button").first().click();
    await page.getByLabel(/^Amount/).fill("5");
    await page.getByTestId("send").click();
    await expect(page.getByTestId("send-done")).toBeVisible({ timeout: 90_000 });
    const href = await page.getByTestId("send-tx").getAttribute("href");
    console.log(`[send] ${href}`);
    expect(href).toMatch(/\/tx\/0x[0-9a-f]{64}$/);

    // The recipient, in their own browser: the transfer shows under "Money in and out" (from the Envio indexer).
    await joiner.page.goto("/app");
    const gate = joiner.page.getByRole("button", { name: "I already use Turn" });
    if (await gate.isVisible().catch(() => false)) await gate.click();
    await expect(joiner.page.getByTestId("activity")).toContainText("From", { timeout: 90_000 });
    await expect(joiner.page.getByTestId("activity")).toContainText("+");
  });

  test("time to first transaction is reported to /metrics", async ({ request }) => {
    const m = (await (await request.get("/api/metrics")).json()) as { count: number; runs: { flow: string; seconds: number; prompts?: number }[] };
    expect(m.count).toBeGreaterThanOrEqual(2);
    for (const r of m.runs.slice(0, 2)) expect(r.prompts).toBe(1);
  });
});
