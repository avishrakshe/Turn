"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { RequireAccount } from "@/components/gate";
import { Icon, type IconName } from "@/components/icons";
import { UnlockNames, useNames } from "@/components/names";
import { usePrefs } from "@/components/providers";
import { Card, Pill, Screen, SectionTitle, Skeleton } from "@/components/ui";
import { countdown, useBalance, useMyCircles, useNow } from "@/lib/hooks";
import { duration, fmt } from "@/lib/money";
import { sessions } from "@/lib/indexer";
import { useSession } from "@/lib/session";

function greeting(now: number) {
  const h = new Date(now * 1000).getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function QuickAction({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 text-xs font-semibold text-primary-ink/90 transition active:scale-95">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-ink/15 backdrop-blur">
        <Icon name={icon} size={21} strokeWidth={2.2} />
      </span>
      {label}
    </Link>
  );
}

function Home() {
  const { currency, rates } = usePrefs();
  const balance = useBalance();
  const my = useMyCircles();
  const names = useNames();
  const now = useNow();
  const { address } = useSession();
  const me = my.data?.Member[0];
  const seats = (my.data?.Membership ?? []).filter((m) => m.status !== "Left");
  const active = seats.filter((s) => s.circle.status !== "Completed");
  const done = seats.filter((s) => s.circle.status === "Completed");
  const grants = useQuery({ queryKey: ["sessions", address], queryFn: () => sessions(address!), enabled: Boolean(address), refetchInterval: 10_000 });
  // Auto-pay that's been turned off or has expired, for a circle that's still running.
  const autopayOff = grants.data
    ? active.filter((s) => {
        if (s.status !== "Active") return false;
        const g = grants.data.Session.find((x) => x.circle_id.toLowerCase() === s.circle_id.toLowerCase());
        return !g || !g.active || Number(g.validUntil) < now;
      })
    : [];

  // Next contribution: the next round start across active circles (auto-pay collects it).
  const next = active
    .filter((s) => s.circle.status === "Active" && s.status === "Active" && s.circle.startTime)
    .map((s) => ({ s, at: Number(s.circle.startTime) + s.circle.currentRound * s.circle.period }))
    .sort((a, b) => a.at - b.at)[0];

  return (
    <Screen
      title="Home"
      large
      action={
        <Link href="/me" aria-label="My record" className="flex h-10 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-bold shadow-sm ring-1 ring-line">
          <Icon name="star" size={15} className="text-accent" strokeWidth={2.4} />
          {me && me.circlesCompleted > 0 ? me.trustLevel : "New saver"}
        </Link>
      }
    >
      <p className="-mt-3 text-sm font-semibold text-muted">{greeting(now)} 👋</p>

      <section className="rise relative overflow-hidden rounded-[30px] bg-gradient-to-br from-primary to-primary-deep p-5 text-primary-ink shadow-[0_24px_48px_-24px_var(--primary)]">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full border-[18px] border-primary-ink/10" />
        <div aria-hidden className="pointer-events-none absolute -right-2 top-16 h-24 w-24 rounded-full bg-accent/30 blur-2xl" />
        <p className="text-sm font-semibold opacity-80">Your money</p>
        <p className="num mt-1 font-display text-[40px] font-extrabold leading-tight tracking-tight" data-testid="balance">
          {balance.data === undefined ? <span className="inline-block h-10 w-40 animate-pulse rounded-xl bg-primary-ink/15 align-middle" /> : fmt(balance.data, currency, rates)}
        </p>
        <p className="mt-1 text-xs opacity-75">Ready for your circles · no fees to move it</p>
        <div className="mt-5 grid grid-cols-4">
          <QuickAction href="/add-money" icon="plus" label="Add" />
          <QuickAction href="/create" icon="users" label="New circle" />
          <QuickAction href="/people" icon="send" label="People" />
          <QuickAction href="/me" icon="shield" label="Record" />
        </div>
      </section>

      {autopayOff.length > 0 && (
        <Link href="/settings" className="rise-2 flex items-center gap-3 rounded-3xl bg-accent-soft p-4" data-testid="autopay-banner">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-[#2a1a05]">
            <Icon name="pause" size={20} />
          </span>
          <span className="flex-1 text-sm">
            <b>Auto-pay for {names.circle(autopayOff[0]!.circle.id, "your circle")} is off.</b>
            <span className="block text-ink/75">Turn it back on so your turn isn&apos;t at risk.</span>
          </span>
          <span className="font-bold text-warn">Fix</span>
        </Link>
      )}

      {next && (
        <Link href={`/circle/${next.s.circle.id}`} className="rise-2 flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 active:scale-[0.99]">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-warn">
            <Icon name="clock" size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-muted">Next contribution · auto-pay</span>
            <span className="num block text-lg font-extrabold">{fmt(next.s.circle.contribution, currency, rates)}</span>
            <span className="block truncate text-xs text-muted">{names.circle(next.s.circle.id, "Your circle")}</span>
          </span>
          <span className="num rounded-full bg-surface-2 px-3 py-1.5 text-xs font-bold">in {countdown(next.at - now)}</span>
        </Link>
      )}

      <SectionTitle action={seats.length > 0 ? <UnlockNames compact /> : undefined}>Your circles</SectionTitle>

      {my.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      )}

      {!my.isLoading && seats.length === 0 && (
        <Card className="rise-3 flex flex-col items-center gap-3 py-8 text-center">
          <div className="relative mb-1 h-20 w-20">
            <div className="spin-slow absolute inset-0 rounded-full border-2 border-dashed border-primary/40" />
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="absolute h-4 w-4 rounded-full bg-primary"
                style={{ left: 40 + 36 * Math.cos((i * Math.PI) / 2) - 8, top: 40 + 36 * Math.sin((i * Math.PI) / 2) - 8, opacity: 0.5 + i * 0.15 }}
              />
            ))}
            <span className="absolute inset-0 m-auto flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[#2a1a05]">
              <Icon name="gift" size={18} />
            </span>
          </div>
          <p className="text-lg font-extrabold">Start your first circle</p>
          <p className="max-w-[280px] text-sm text-muted">Save with family or friends. Everyone chips in, and each round one person receives the pot.</p>
          <Link href="/create" className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-gradient-to-b from-primary to-primary-deep px-6 font-bold text-primary-ink">
            <Icon name="plus" size={18} strokeWidth={2.4} /> Start a circle
          </Link>
          <p className="text-xs text-muted">Got an invite? Just open the link.</p>
        </Card>
      )}

      <ul className="flex flex-col gap-3" data-testid="circles">
        {[...active, ...done].map((s, i) => {
          const c = s.circle;
          const pot = BigInt(c.contribution) * BigInt(c.activeCount || c.size);
          const label = names.circle(c.id, `Circle of ${c.size}`);
          const progress = c.status === "Completed" ? 1 : c.status === "Forming" ? c.memberCount / Math.max(1, c.size) : (c.currentRound - 1) / Math.max(1, c.totalRounds);
          return (
            <li key={s.id} className={["rise", "rise-2", "rise-3"][i] ?? ""}>
              <Link href={`/circle/${c.id}`} className="block rounded-[26px] border border-line bg-surface p-4 transition hover:border-primary/30 active:scale-[0.99]">
                <div className="flex items-start gap-3">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${c.status === "Completed" ? "bg-accent-soft text-warn" : "bg-primary-soft text-primary"}`}>
                    <Icon name={c.status === "Completed" ? "gift" : "repeat"} size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{label}</p>
                    <p className="text-xs text-muted">
                      {fmt(c.contribution, currency, rates)} every {duration(c.period)}
                    </p>
                  </div>
                  {c.status === "Forming" && <Pill tone="accent">Waiting · {c.memberCount}/{c.size}</Pill>}
                  {c.status === "Active" && <Pill tone="good"><span className="live-dot h-1.5 w-1.5 rounded-full bg-good" />Round {c.currentRound} of {c.totalRounds}</Pill>}
                  {c.status === "Completed" && <Pill tone="primary">Complete</Pill>}
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 text-muted">
                    <span className="flex items-center gap-1">
                      <Icon name="users" size={14} /> {c.memberCount}/{c.size}
                    </span>
                    · Pot <b className="num text-ink">{fmt(pot, currency, rates)}</b>
                  </span>
                  <span className={s.hasWon ? "font-bold text-good" : s.status === "Ejected" ? "font-bold text-bad" : "font-semibold text-muted"}>
                    {s.status === "Ejected" ? "Left the circle" : s.hasWon ? `You received in round ${s.wonRound}` : "Your turn is coming"}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {seats.length > 0 && (
        <Link href="/create" className="flex items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line py-4 text-sm font-bold text-muted transition hover:border-primary/40 hover:text-primary">
          <Icon name="plus" size={18} strokeWidth={2.4} /> Start another circle
        </Link>
      )}
    </Screen>
  );
}

export default function Page() {
  return (
    <RequireAccount title="Home">
      <Home />
    </RequireAccount>
  );
}
