"use client";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { Address } from "viem";
import { RequireAccount } from "@/components/gate";
import { useNames } from "@/components/names";
import { usePrefs } from "@/components/providers";
import { ShareInvite } from "@/components/share";
import { Button, Card, Notice, Screen } from "@/components/ui";
import { createCircleCalls, run, testDollarsCall, type NewCircle } from "@/lib/actions";
import { predictCircle } from "@/lib/chain";
import { config } from "@/lib/config";
import { useBalance } from "@/lib/hooks";
import { CURRENCIES, duration, fmt, localToUnits } from "@/lib/money";
import { track } from "@/lib/metrics";
import { inviteLink } from "@/lib/invite";
import { inviteSecret } from "@/lib/passkey";
import { useSession } from "@/lib/session";

const FREQUENCIES = [
  { label: "Every month", seconds: 30 * 86_400 },
  { label: "Every week", seconds: 7 * 86_400 },
  { label: "Demo: every 5 minutes", seconds: 300 },
];

function Create() {
  const { currency: myCurrency, rates } = usePrefs();
  const { account, address, unlock } = useSession();
  const names = useNames();
  const balance = useBalance();
  const qc = useQueryClient();
  const [name, setName] = useState("Family circle");
  const [currency, setCurrency] = useState(myCurrency);
  const [amount, setAmount] = useState(currency === "INR" ? "5000" : "100");
  const [size, setSize] = useState(5);
  const [period, setPeriod] = useState(FREQUENCIES[0]!.seconds);
  const [auction, setAuction] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ circle: Address; link: string } | null>(null);

  const units = localToUnits(Number(amount) || 0, currency, rates);
  // Factory limits: 25 AUSD per contribution on the mainnet beta, 1,000 on testnet.
  const cap = config.chainId === 143 ? 25_000_000n : 1_000_000_000n;
  const valid = units > 0n && units <= cap && size >= 3 && size <= 10;

  async function submit() {
    if (!account || !address) return;
    setBusy(true);
    setErr(null);
    try {
      const c: NewCircle = { size, contribution: units, period, auction, currency };
      const predicted = await predictCircle(address);
      // Invite secret from the passkey's "invite" namespace: rebuilt from the passkey on any device, never stored.
      const secret = await inviteSecret(await unlock("invite"), predicted);
      const calls = createCircleCalls(address, predicted, c, secret);
      if (config.testToken && (balance.data ?? 0n) < units) calls.unshift(...testDollarsCall(address, units * 3n));
      await run(account, calls);
      track("firstTx");
      names.remember(predicted, name);
      await qc.invalidateQueries();
      setDone({ circle: predicted, link: inviteLink(predicted, secret, name) });
    } catch (e) {
      console.warn("[turn] create failed:", e);
      setErr((e as Error).message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen title="Invite your people" back="/home">
        <Card className="pop text-center">
          <p className="text-5xl">🎉</p>
          <h2 className="mt-2 text-2xl font-extrabold">{name} is ready</h2>
          <p className="mt-2 text-muted">
            Share the link with {size - 1} more {size - 1 === 1 ? "person" : "people"}. The first round starts when everyone has joined.
          </p>
        </Card>
        <ShareInvite link={done.link} circleName={name} amount={fmt(units, currency, rates)} />
        {/* Client-side navigation keeps the in-memory passkey session (a full reload would ask for Face ID again). */}
        <Link href={`/circle/${done.circle}`} className="text-center font-bold text-primary">
          Go to the circle →
        </Link>
      </Screen>
    );
  }

  const pot = units * BigInt(size);
  return (
    <Screen title="Start a circle" back="/home">
      <Card className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Name (only visible to you)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="min-h-12 rounded-2xl border border-line bg-bg px-4" />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Each person puts in</span>
          <div className="flex gap-2">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="min-h-12 rounded-2xl border border-line bg-bg px-3 font-semibold">
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.code}
                </option>
              ))}
            </select>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="num min-h-12 w-full min-w-0 flex-1 rounded-2xl border border-line bg-bg px-4 text-lg font-bold"
              aria-label="Amount"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">How many people (including you)</span>
          <div className="flex items-center gap-3">
            <button className="h-12 w-12 rounded-2xl border border-line text-xl font-bold" onClick={() => setSize((s) => Math.max(3, s - 1))} aria-label="Fewer">
              −
            </button>
            <span className="num w-10 text-center text-2xl font-extrabold">{size}</span>
            <button className="h-12 w-12 rounded-2xl border border-line text-xl font-bold" onClick={() => setSize((s) => Math.min(10, s + 1))} aria-label="More">
              +
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">How often</span>
          <div className="grid gap-2">
            {FREQUENCIES.map((f) => (
              <button
                key={f.seconds}
                onClick={() => setPeriod(f.seconds)}
                className={`min-h-12 rounded-2xl border px-4 text-left font-semibold ${period === f.seconds ? "border-primary bg-primary-soft text-primary" : "border-line"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Who gets the pot first?</span>
          <button
            onClick={() => setAuction(true)}
            className={`rounded-2xl border p-4 text-left ${auction ? "border-primary bg-primary-soft" : "border-line"}`}
          >
            <span className="font-bold">Whoever needs it most</span>
            <span className="block text-sm text-muted">Members can offer a small discount to receive earlier. The discount is shared with everyone else.</span>
          </button>
          <button
            onClick={() => setAuction(false)}
            className={`rounded-2xl border p-4 text-left ${!auction ? "border-primary bg-primary-soft" : "border-line"}`}
          >
            <span className="font-bold">Take turns in order</span>
            <span className="block text-sm text-muted">In the order people join.</span>
          </button>
        </div>
      </Card>

      <Card className="bg-surface-2">
        <p className="text-sm text-muted">In plain words</p>
        <p className="mt-1 font-semibold">
          {size} people each put in {fmt(units, currency, rates)} {duration(period) === "1 month" ? "every month" : `every ${duration(period)}`}. Each
          round, one person receives <span className="text-primary">{fmt(pot, currency, rates)}</span>. It takes {size} rounds so everyone gets a
          turn.
        </p>
        <p className="mt-2 text-sm text-muted">
          You'll put down a deposit of {fmt(units, currency, rates)} now. You get it back at the end.
        </p>
      </Card>

      {err && <Notice tone="bad">{err}</Notice>}
      <Button loading={busy} disabled={!valid} onClick={submit}>
        Create circle
      </Button>
    </Screen>
  );
}

export default function Page() {
  return (
    <RequireAccount title="Start a circle">
      <Create />
    </RequireAccount>
  );
}
