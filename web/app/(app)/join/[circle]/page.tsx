"use client";
// Join via invite link. New users: one Face ID creates the account AND signs the gasless join
// (approve + join + auto-pay in one sponsored transaction). Existing users confirm with Face ID.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { getAddress, isAddress, keccak256, zeroHash, type Address, type Hex } from "viem";
import { Icon, type IconName } from "@/components/icons";
import { useNames } from "@/components/names";
import { PasskeyHelp } from "@/components/passkey-help";
import { usePrefs } from "@/components/providers";
import { Button, Card, Notice, Screen, Skeleton } from "@/components/ui";
import { joinCalls, run, testDollarsCall } from "@/lib/actions";
import { passkeyErrorKind } from "@/lib/capability";
import { balanceOf, circleInviteHash, circleParams } from "@/lib/chain";
import { config } from "@/lib/config";
import { circleDetail } from "@/lib/indexer";
import { track } from "@/lib/metrics";
import { duration, fmt } from "@/lib/money";
import { useSession } from "@/lib/session";

function Join() {
  const { circle: raw } = useParams<{ circle: string }>();
  const q = useSearchParams();
  const secret = (q.get("s") ?? "") as Hex;
  const suggested = q.get("n") ?? "";
  const router = useRouter();
  const qc = useQueryClient();
  const { currency, rates } = usePrefs();
  const session = useSession();
  const names = useNames();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const valid = isAddress(raw);
  const circle = (valid ? getAddress(raw) : raw) as Address;

  const info = useQuery({
    queryKey: ["join", circle],
    enabled: valid,
    queryFn: async () => {
      const [p, hash, idx] = await Promise.all([circleParams(circle), circleInviteHash(circle), circleDetail(circle)]);
      return { p, hash, c: idx.Circle[0], members: idx.Membership };
    },
    refetchInterval: 5_000,
  });

  if (!valid)
    return (
      <Screen title="Join" back="/" nav={false}>
        <Notice tone="bad" icon="link">
          This invite link is broken. Ask for a new one.
        </Notice>
      </Screen>
    );
  if (info.isLoading || !info.data)
    return (
      <Screen title="You're invited" back="/" nav={false}>
        <Skeleton className="h-52" />
        <Skeleton className="h-72" />
      </Screen>
    );

  const { p, hash, c, members } = info.data;
  const inviteOk = hash === zeroHash || (/^0x[0-9a-fA-F]{64}$/.test(secret) && keccak256(secret) === hash);
  const pot = p.contribution * BigInt(p.n);
  const auction = p.mode === 1;
  const already = session.address && members.some((m) => m.member_id.toLowerCase() === session.address!.toLowerCase());
  const full = c ? c.status !== "Forming" : false;
  const name = names.circle(circle, suggested || `Circle of ${p.n}`);
  const joinedCount = c?.memberCount ?? 0;

  async function join() {
    setBusy(true);
    setErr(null);
    try {
      // First visit: this single Face ID creates the account and the same session signs the join.
      // Returning users (even after a refresh) confirm with their existing passkey; never a second account.
      const acct = session.address ? await session.confirm() : await session.create("");
      const me = acct.address;
      const calls = joinCalls(me, circle, { contribution: p.contribution, entryDeposit: p.entryDeposit, period: p.period, n: p.n }, secret, currency);
      if (config.testToken && (await balanceOf(me)) < p.entryDeposit) calls.unshift(...testDollarsCall(me, p.contribution * 3n));
      await run(acct, calls);
      track("firstTx");
      if (suggested) names.remember(circle, suggested);
      await qc.invalidateQueries();
      router.push(`/circle/${circle}?joined=1`);
    } catch (e) {
      const kind = passkeyErrorKind(e);
      if (kind === "unsupported") setHelp(true);
      else if (kind === "cancelled") setErr("Face ID was cancelled. Tap Join when you're ready.");
      else setErr((e as Error).message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="You're invited" back="/" nav={false}>
      <section className="rise relative overflow-hidden rounded-[30px] bg-gradient-to-br from-primary to-primary-deep p-6 text-center text-primary-ink">
        <div aria-hidden className="pointer-events-none absolute -left-12 -top-12 h-44 w-44 rounded-full border-[16px] border-primary-ink/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-10 -right-6 h-32 w-32 rounded-full bg-accent/30 blur-2xl" />
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-ink/15">
          <Icon name="users" size={26} />
        </span>
        <p className="mt-3 text-xs font-bold uppercase tracking-wider opacity-75">You&apos;re invited to</p>
        <h1 className="mt-1 font-display text-[28px] font-extrabold leading-tight tracking-tight" data-testid="circle-name">
          {name}
        </h1>
        <div className="mx-auto mt-4 flex max-w-[220px] items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-ink/20">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(joinedCount / p.n) * 100}%` }} />
          </div>
          <span className="num text-xs font-bold">
            {joinedCount}/{p.n}
          </span>
        </div>
        <p className="mt-1 text-xs opacity-80">people have joined</p>
      </section>

      <div className="rise-2 grid grid-cols-2 gap-3">
        <div className="rounded-3xl border border-line bg-surface p-4">
          <p className="text-xs font-semibold text-muted">You put in</p>
          <p className="num mt-1 text-lg font-extrabold">{fmt(p.contribution, currency, rates)}</p>
          <p className="text-xs text-muted">every {duration(p.period)}</p>
        </div>
        <div className="rounded-3xl border border-line bg-accent-soft p-4">
          <p className="text-xs font-semibold text-muted">Your turn</p>
          <p className="num mt-1 text-lg font-extrabold">{fmt(pot, currency, rates)}</p>
          <p className="text-xs text-muted">once, in one of {p.n} rounds</p>
        </div>
      </div>

      <Card className="rise-3 flex flex-col gap-4">
        <h2 className="font-extrabold">How it works</h2>
        {auction ? (
          <Rule icon="bolt">Need it sooner? Offer a small discount to receive earlier. Discounts are shared with everyone else.</Rule>
        ) : (
          <Rule icon="repeat">People receive in the order they joined.</Rule>
        )}
        <Rule icon="shield">
          A <b>{fmt(p.entryDeposit, currency, rates)}</b> deposit, returned at the end. If someone misses a payment, deposits and a shared safety fund
          cover it, so you still get your full turn.
        </Rule>
        <Rule icon="clock">
          <b>Auto-pay is on.</b> Collected each round, for this circle only and never more than {fmt(p.contribution, currency, rates)}. Turn it off any time.
        </Rule>
        <Rule icon="bolt">No fees. No app to install. Nobody, including us, can take the money.</Rule>
      </Card>

      {!inviteOk && (
        <Notice tone="bad" icon="link">
          This invite link isn&apos;t valid anymore. Ask for a fresh one.
        </Notice>
      )}
      {full && !already && <Notice icon="users">This circle already has everyone it needs.</Notice>}
      {err && (
        <Notice tone="bad" icon="info">
          {err}
        </Notice>
      )}

      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
        {already ? (
          <Button onClick={() => router.push(`/circle/${circle}`)} icon="check">
            You&apos;re in. Open the circle
          </Button>
        ) : (
          <>
            <Button icon="face" loading={busy} disabled={!inviteOk || full} onClick={join} data-testid="join">
              Join with Face ID
            </Button>
            {!session.address ? (
              <p className="text-center text-xs text-muted">
                New to Turn? This also creates your account.{" "}
                <button className="font-semibold text-primary" onClick={() => void session.signIn().catch(() => {})}>
                  I already use Turn
                </button>
              </p>
            ) : (
              <p className="text-center text-xs text-muted">No fees · no passwords · takes seconds</p>
            )}
          </>
        )}
      </div>
      <PasskeyHelp open={help} onClose={() => setHelp(false)} onRetry={join} />
    </Screen>
  );
}

function Rule({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm leading-relaxed">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon name={icon} size={18} />
      </span>
      <span className="pt-1">{children}</span>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Join />
    </Suspense>
  );
}
