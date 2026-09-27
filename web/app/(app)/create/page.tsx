"use client";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { Address } from "viem";
import { RequireAccount } from "@/components/gate";
import { Icon, type IconName } from "@/components/icons";
import { useNames } from "@/components/names";
import { usePrefs } from "@/components/providers";
import { ShareInvite } from "@/components/share";
import { Button, Card, Confetti, Notice, Screen, useToast } from "@/components/ui";
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
  { label: "Every month", short: "Monthly", seconds: 30 * 86_400 },
  { label: "Every week", short: "Weekly", seconds: 7 * 86_400 },
  { label: "Demo: every 5 minutes", short: "5 min demo", seconds: 300 },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-sm font-bold">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Choice({ on, onClick, icon, title, text }: { on: boolean; onClick: () => void; icon: IconName; title: string; text: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition active:scale-[0.99] ${on ? "border-primary bg-primary-soft" : "border-line bg-surface"}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? "bg-primary text-primary-ink" : "bg-surface-2 text-muted"}`}>
        <Icon name={icon} size={19} />
      </span>
      <span className="flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
      <span className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full border-2 ${on ? "border-primary bg-primary text-primary-ink" : "border-line"}`}>
        {on && <Icon name="check" size={12} strokeWidth={3.5} />}
      </span>
    </button>
  );
}

function Create() {
  const { currency: myCurrency, rates } = usePrefs();
  const { ensureAccount, unlock } = useSession();
  const names = useNames();
  const toast = useToast();
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
  const tooBig = units > cap;
  const valid = units > 0n && !tooBig && size >= 3 && size <= 10;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      // After a refresh the address is known but the signer isn't: this asks for Face ID once.
      const account = await ensureAccount();
      const address = account.address;
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
      toast("Circle created");
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
        <Confetti />
        <div className="pop flex flex-col items-center pt-4 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-accent to-[#e08a1e] text-[#2a1a05] shadow-[0_18px_40px_-16px_var(--accent)]">
            <Icon name="gift" size={36} />
          </span>
          <h2 className="mt-4 font-display text-[26px] font-extrabold tracking-tight">{name} is ready</h2>
          <p className="mt-2 max-w-[300px] text-muted">
            Share the link with {size - 1} more {size - 1 === 1 ? "person" : "people"}. The first round starts when everyone has joined.
          </p>
        </div>
        <ShareInvite link={done.link} circleName={name} amount={fmt(units, currency, rates)} />
        {/* Client-side navigation keeps the in-memory passkey session. */}
        <Link href={`/circle/${done.circle}`} className="flex items-center justify-center gap-1 py-2 font-bold text-primary">
          Go to the circle <Icon name="chevron" size={18} />
        </Link>
      </Screen>
    );
  }

  const pot = units * BigInt(size);
  const every = duration(period) === "1 month" ? "every month" : `every ${duration(period)}`;
  return (
    <Screen title="Start a circle" back="/home" nav={false}>
      {/* Live preview */}
      <section className="rise relative overflow-hidden rounded-[28px] bg-gradient-to-br from-primary to-primary-deep p-5 text-primary-ink">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border-[14px] border-primary-ink/10" />
        <p className="text-xs font-bold uppercase tracking-wider opacity-75">Each round, someone receives</p>
        <p className="num mt-1 font-display text-[36px] font-extrabold leading-tight">{fmt(pot, currency, rates)}</p>
        <p className="mt-2 text-sm opacity-85">
          {size} people × {fmt(units, currency, rates)} {every} · {size} rounds so everyone gets a turn
        </p>
      </section>

      <Card className="flex flex-col gap-6">
        <Field label="Name" hint="Only visible to you">
          <input value={name} onChange={(e) => setName(e.target.value)} className="min-h-12 rounded-2xl border border-line bg-bg px-4 font-semibold outline-none focus:border-primary" />
        </Field>

        <Field label="Each person puts in">
          <div className="flex gap-2">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="min-h-14 rounded-2xl border border-line bg-bg px-3 font-semibold outline-none focus:border-primary"
              aria-label="Currency"
            >
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
              className="num min-h-14 w-full min-w-0 flex-1 rounded-2xl border border-line bg-bg px-4 font-display text-2xl font-extrabold outline-none focus:border-primary"
              aria-label="Amount"
            />
          </div>
          {tooBig && <p className="px-1 text-xs font-semibold text-bad">That&apos;s above the limit for this beta ({fmt(cap, currency, rates)}).</p>}
        </Field>

        <Field label="People" hint="Including you, 3 to 10">
          <div className="flex items-center justify-between rounded-2xl bg-surface-2 p-2">
            <button
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-2xl font-bold shadow-sm transition active:scale-90 disabled:opacity-40"
              onClick={() => setSize((s) => Math.max(3, s - 1))}
              disabled={size <= 3}
              aria-label="Fewer"
            >
              −
            </button>
            <div className="flex flex-col items-center">
              <span className="num font-display text-3xl font-extrabold">{size}</span>
              <span className="flex gap-1">
                {Array.from({ length: size }, (_, i) => (
                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-accent" : "bg-primary"}`} />
                ))}
              </span>
            </div>
            <button
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-2xl font-bold shadow-sm transition active:scale-90 disabled:opacity-40"
              onClick={() => setSize((s) => Math.min(10, s + 1))}
              disabled={size >= 10}
              aria-label="More"
            >
              +
            </button>
          </div>
        </Field>

        <Field label="How often">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
            {FREQUENCIES.map((f) => (
              <button
                key={f.seconds}
                onClick={() => setPeriod(f.seconds)}
                aria-label={f.label}
                aria-pressed={period === f.seconds}
                className={`min-h-11 rounded-xl text-sm font-bold transition ${period === f.seconds ? "bg-surface text-primary shadow-sm" : "text-muted"}`}
              >
                {f.short}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Who receives first?">
          <Choice
            on={auction}
            onClick={() => setAuction(true)}
            icon="bolt"
            title="Whoever needs it most"
            text="Members can offer a small discount to receive earlier. The discount is shared with everyone else."
          />
          <Choice on={!auction} onClick={() => setAuction(false)} icon="repeat" title="Take turns in order" text="In the order people join." />
        </Field>
      </Card>

      <Notice icon="shield">
        You&apos;ll put down a deposit of <b>{fmt(units, currency, rates)}</b> now, returned at the end. It protects everyone if someone misses a payment.
      </Notice>

      {err && (
        <Notice tone="bad" icon="info">
          {err}
        </Notice>
      )}
      <div className="sticky bottom-0 -mx-4 mt-auto bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
        <Button className="w-full" icon="face" loading={busy} disabled={!valid} onClick={submit}>
          Create circle
        </Button>
      </div>
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
