"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { Address } from "viem";
import { RequireAccount } from "@/components/gate";
import { useNames } from "@/components/names";
import { usePrefs } from "@/components/providers";
import { Button, Card, Notice, Pill, Screen } from "@/components/ui";
import { currencyCall, renewCall, revokeCall, run } from "@/lib/actions";
import { config } from "@/lib/config";
import { useMyCircles } from "@/lib/hooks";
import { sessions } from "@/lib/indexer";
import { CURRENCIES, fmt } from "@/lib/money";
import { useSession } from "@/lib/session";

function Settings() {
  const { address, account, confirm, exportPhrase, signOut } = useSession();
  const { currency, setCurrency, rates } = usePrefs();
  const names = useNames();
  const my = useMyCircles();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const grants = useQuery({ queryKey: ["sessions", address], queryFn: () => sessions(address!), enabled: Boolean(address), refetchInterval: 5_000 });
  const activeSeats = (my.data?.Membership ?? []).filter((m) => m.status === "Active" && m.circle.status !== "Completed");

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      await qc.invalidateQueries();
    } catch (e) {
      setErr((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title="Settings">
      {err && <Notice tone="bad">{err}</Notice>}

      <Card className="flex flex-col gap-3">
        <h2 className="font-extrabold">Show amounts in</h2>
        <select
          value={currency}
          onChange={(e) => {
            const next = e.target.value;
            setCurrency(next);
            // Saved with your circles so every device shows the same currency.
            if (account && activeSeats.length)
              void act("currency", () => run(account, activeSeats.flatMap((s) => currencyCall(s.circle_id as Address, next))));
          }}
          className="min-h-12 rounded-2xl border border-line bg-bg px-3 font-semibold"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">Your money is held in US dollars. This only changes how amounts are shown.</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-extrabold">Auto-pay</h2>
        <p className="text-sm text-muted">
          Each circle can collect only its own contribution, once per round, never more. Turning it off means you'll need to tap "Pay now" each round.
        </p>
        {(grants.data?.Session ?? []).length === 0 && <p className="text-sm text-muted">No auto-pay set up yet.</p>}
        <ul className="flex flex-col gap-3">
          {(grants.data?.Session ?? []).map((g) => {
            const seat = activeSeats.find((s) => s.circle_id.toLowerCase() === g.circle_id.toLowerCase());
            const expired = Number(g.validUntil) < Date.now() / 1000;
            return (
              <li key={g.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
                <div className="flex-1">
                  <p className="font-semibold">{names.circle(g.circle_id, "Circle")}</p>
                  <p className="text-xs text-muted">
                    up to {fmt(g.maxAmount, currency, rates)} per round · {g.pulls} collected
                  </p>
                </div>
                {g.active && !expired ? (
                  <>
                    <Pill tone="good">On</Pill>
                    <button
                      className="text-sm font-bold text-bad"
                      disabled={busy !== null}
                      onClick={() => act(`revoke-${g.id}`, async () => run(await confirm(), revokeCall(address as Address, g.circle_id as Address)))}
                    >
                      Turn off
                    </button>
                  </>
                ) : seat ? (
                  <button
                    className="text-sm font-bold text-primary"
                    disabled={busy !== null}
                    onClick={() =>
                      act(`renew-${g.id}`, async () =>
                        run(await confirm(), renewCall(address as Address, g.circle_id as Address, BigInt(seat.circle.contribution), seat.circle.period, seat.circle.size)),
                      )
                    }
                  >
                    {expired ? "Auto-pay ended · Turn back on" : "Turn on"}
                  </button>
                ) : (
                  <Pill>Off</Pill>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-extrabold">Updates on Telegram</h2>
        <p className="text-sm text-muted">Get a message when contributions are collected, bidding opens, and payouts go out, in your currency.</p>
        <a href={`https://t.me/${config.telegramBot}`} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#229ED9] font-bold text-white">
          Open @{config.telegramBot}
        </a>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-extrabold">People</h2>
        <p className="text-sm text-muted">Give people names like "Mom" or "Ravi bhai". Names are encrypted with your passkey, so only you can see them.</p>
        <Link href="/people" className="font-bold text-primary">
          Manage names →
        </Link>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-extrabold">Back up your account</h2>
        <p className="text-sm text-muted">
          Your passkey is your backup, and it syncs with your phone's account. If you'd also like a 24-word recovery phrase for another app, you can reveal it here.
        </p>
        {phrase ? (
          <>
            <Notice tone="bad">Never share these words. Anyone with them can take your money. Turn will never ask for them.</Notice>
            <p className="rounded-2xl bg-surface-2 p-4 font-mono text-sm leading-7" data-testid="phrase">
              {phrase}
            </p>
            <Button variant="secondary" onClick={() => setPhrase(null)}>
              Hide
            </Button>
          </>
        ) : (
          <Button variant="secondary" loading={busy === "phrase"} onClick={() => act("phrase", async () => setPhrase(await exportPhrase()))}>
            Reveal recovery phrase (Face ID)
          </Button>
        )}
      </Card>

      <Button variant="danger" onClick={signOut}>
        Lock Turn
      </Button>
    </Screen>
  );
}

export default function Page() {
  return (
    <RequireAccount title="Settings">
      <Settings />
    </RequireAccount>
  );
}
