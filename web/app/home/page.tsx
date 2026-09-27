"use client";
import Link from "next/link";
import { RequireAccount } from "@/components/gate";
import { UnlockNames, useNames } from "@/components/names";
import { usePrefs } from "@/components/providers";
import { Card, Pill, Screen } from "@/components/ui";
import { countdown, useBalance, useMyCircles, useNow } from "@/lib/hooks";
import { duration, fmt } from "@/lib/money";

function Home() {
  const { currency, rates } = usePrefs();
  const balance = useBalance();
  const my = useMyCircles();
  const names = useNames();
  const now = useNow();
  const me = my.data?.Member[0];
  const seats = (my.data?.Membership ?? []).filter((m) => m.status !== "Left");
  const active = seats.filter((s) => s.circle.status !== "Completed");

  // Next contribution: the next round start across active circles (auto-pay collects it).
  const next = active
    .filter((s) => s.circle.status === "Active" && s.status === "Active" && s.circle.startTime)
    .map((s) => ({ s, at: Number(s.circle.startTime) + s.circle.currentRound * s.circle.period }))
    .sort((a, b) => a.at - b.at)[0];

  return (
    <Screen title="Turn" action={<Link href="/add-money" className="text-sm font-bold text-primary">Add money</Link>}>
      <Card className="bg-primary text-primary-ink">
        <p className="text-sm font-semibold opacity-80">Your money</p>
        <p className="num mt-1 text-4xl font-extrabold" data-testid="balance">
          {balance.data === undefined ? "…" : fmt(balance.data, currency, rates)}
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/add-money" className="rounded-xl bg-primary-ink/15 px-3 py-2 text-sm font-bold">
            + Add money
          </Link>
          <Link href="/me" className="rounded-xl bg-primary-ink/15 px-3 py-2 text-sm font-bold">
            {me && me.circlesCompleted > 0 ? `⭐ ${me.trustLevel}` : "⭐ New saver"}
          </Link>
        </div>
      </Card>

      {next && (
        <Card>
          <p className="text-sm font-semibold text-muted">Next contribution</p>
          <p className="num mt-1 text-2xl font-extrabold">{fmt(next.s.circle.contribution, currency, rates)}</p>
          <p className="text-sm text-muted">
            {names.circle(next.s.circle.id, "Your circle")} · collected automatically in {countdown(next.at - now)}
          </p>
        </Card>
      )}

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-lg font-extrabold">Your circles</h2>
        {seats.length > 0 && <UnlockNames compact />}
      </div>

      {my.isLoading && <p className="text-muted">Loading your circles…</p>}

      {!my.isLoading && seats.length === 0 && (
        <Card className="flex flex-col items-center gap-3 text-center">
          <span className="text-4xl">🌱</span>
          <p className="font-bold">No circles yet</p>
          <p className="text-sm text-muted">Start one with family or friends, or open the invite link someone sent you.</p>
          <Link href="/create" className="mt-2 rounded-2xl bg-primary px-5 py-3 font-bold text-primary-ink">
            Start a circle
          </Link>
        </Card>
      )}

      <ul className="flex flex-col gap-3" data-testid="circles">
        {seats.map((s) => {
          const c = s.circle;
          const pot = BigInt(c.contribution) * BigInt(c.activeCount || c.size);
          const label = names.circle(c.id, `Circle of ${c.size}`);
          const progress = c.status === "Completed" ? 1 : c.status === "Forming" ? 0 : (c.currentRound - 1) / Math.max(1, c.totalRounds);
          return (
            <li key={s.id}>
              <Link href={`/circle/${c.id}`} className="block rounded-3xl border border-line bg-surface p-5 active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{label}</p>
                    <p className="text-sm text-muted">
                      {fmt(c.contribution, currency, rates)} every {duration(c.period)} · {c.memberCount}/{c.size} people
                    </p>
                  </div>
                  {c.status === "Forming" && <Pill tone="accent">Waiting for people</Pill>}
                  {c.status === "Active" && <Pill tone="good">Round {c.currentRound} of {c.totalRounds}</Pill>}
                  {c.status === "Completed" && <Pill tone="primary">Complete 🎉</Pill>}
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted">Pot {fmt(pot, currency, rates)}</span>
                  <span className={s.hasWon ? "font-bold text-good" : "text-muted"}>
                    {s.status === "Ejected" ? "Left the circle" : s.hasWon ? `You received in round ${s.wonRound}` : "Your turn is coming"}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}

export default function Page() {
  return (
    <RequireAccount title="Turn">
      <Home />
    </RequireAccount>
  );
}
