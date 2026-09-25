import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { getAddress, type Address, type PublicClient } from "viem";
import { turnAccountAbi } from "@turn/contracts/abi";
import type { RelayRequest, RelayResponse } from "./client.ts";
import type { RelayerConfig } from "./config.ts";
import { Policy, PolicyError } from "./policy.ts";
import type { RelayerStore } from "./store.ts";
import { SubmitError, type Submitter } from "./submit.ts";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const address = hex.length(42);
const uint = z.string().regex(/^[0-9]+$/);

const RelayBody = z.object({
  account: address,
  calls: z.array(z.object({ target: address, data: hex })).min(1),
  nonce: uint,
  deadline: uint,
  signature: hex,
  authorization: z
    .object({
      address,
      chainId: z.number().int(),
      nonce: z.number().int().nonnegative(),
      r: hex,
      s: hex,
      yParity: z.number().int().min(0).max(1),
    })
    .optional(),
});

export type AppDeps = {
  cfg: RelayerConfig;
  publicClient: PublicClient;
  submitter: Submitter;
  store: RelayerStore;
  relayerAddress: Address;
  now?: () => number;
};

export function createApp(deps: AppDeps) {
  const { cfg, publicClient, submitter, store, relayerAddress } = deps;
  const now = deps.now ?? (() => Date.now());
  const policy = new Policy(cfg, publicClient);
  const app = new Hono();
  app.use("*", cors({ origin: cfg.corsOrigin }));

  app.get("/health", async (c) => {
    const balance = await publicClient.getBalance({ address: relayerAddress });
    return c.json({ ok: true, chainId: cfg.chainId, relayer: relayerAddress, balanceWei: balance.toString() });
  });

  /** Everything the app needs before signing: nonce, whether delegation is needed, remaining sponsored gas. */
  app.get("/v1/accounts/:address", async (c) => {
    const parsed = address.safeParse(c.req.param("address"));
    if (!parsed.success) return c.json({ ok: false, error: "bad address" }, 400);
    const account = getAddress(parsed.data);
    const delegated = await submitter.isDelegatedToTurn(account);
    const nonce = delegated
      ? await publicClient.readContract({ address: account, abi: turnAccountAbi, functionName: "nonce" })
      : 0n;
    const eoaNonce = await publicClient.getTransactionCount({ address: account });
    const used = store.gasUsedToday(account, now());
    return c.json({
      ok: true,
      account,
      delegated,
      accountImplementation: cfg.accountImplementation,
      nonce: nonce.toString(),
      eoaNonce,
      chainId: cfg.chainId,
      gasUsedToday: used.toString(),
      gasLimitPerDay: cfg.dailyGasPerAccount.toString(),
    });
  });

  app.post("/v1/relay", async (c) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!store.hit(`ip:${ip}`, cfg.rateLimitPerIpPerMin, now())) {
      return c.json<RelayResponse>({ ok: false, error: "too many requests" }, 429);
    }
    const body = RelayBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json<RelayResponse>({ ok: false, error: "bad request", detail: body.error.message }, 400);
    const req: RelayRequest = { ...body.data, account: getAddress(body.data.account) } as RelayRequest;

    try {
      if (!store.hit(`acct:${req.account.toLowerCase()}`, cfg.rateLimitPerAccountPerMin, now())) {
        throw new PolicyError(429, "too many requests for this account");
      }
      policy.checkShape(req, Math.floor(now() / 1000));
      await policy.checkTargets(req.account, req.calls);
      const prepared = await submitter.prepare(req);
      const used = store.gasUsedToday(req.account, now());
      if (used + prepared.gas > cfg.dailyGasPerAccount) throw new PolicyError(429, "daily sponsored gas used up");
      const result = await submitter.submit(req, prepared);
      // Monad bills the gas limit, so the budget is charged the limit, not gasUsed.
      store.addGas(req.account, result.gasLimit, now());
      return c.json<RelayResponse>({
        ok: true,
        txHash: result.hash,
        gasUsed: result.gasUsed.toString(),
        delegated: true,
      });
    } catch (err) {
      if (err instanceof PolicyError) return c.json<RelayResponse>({ ok: false, error: err.message }, err.status);
      if (err instanceof SubmitError) {
        return c.json<RelayResponse>({ ok: false, error: err.message, detail: err.detail }, err.status);
      }
      console.error("relay failed", err);
      return c.json<RelayResponse>({ ok: false, error: "relay failed" }, 502);
    }
  });

  return app;
}
