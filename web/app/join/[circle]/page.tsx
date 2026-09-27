"use client";
// Join via invite link. New users: one Face ID creates the account AND signs the gasless join
// (approve + join + auto-pay in one sponsored transaction). Existing users confirm with Face ID.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { getAddress, isAddress, keccak256, zeroHash, type Address, type Hex } from "viem";
import { useNames } from "@/components/names";
import { usePrefs } from "@/components/providers";
import { Button, Card, Notice, Pill, Screen } from "@/components/ui";
import { joinCalls, run, testDollarsCall } from "@/lib/actions";
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

  if (!valid) return <Screen title="Join" back="/"><Notice tone="bad">This invite link is broken. Ask for a new one.</Notice></Screen>;
  if (info.isLoading || !info.data) return <Screen title="Join a circle" back="/"><p className="text-muted">Opening the invite…</p></Screen>;

  const { p, hash, c, members } = info.data;
  const inviteOk = hash === zeroHash || (/^0x[0-9a-fA-F]{64}$/.test(secret) && keccak256(secret) === hash);
  const pot = p.contribution * BigInt(p.n);
  const auction = p.mode === 1;
  const already = session.address && members.some((m) => m.member_id.toLowerCase() === session.address!.toLowerCase());
  const full = c ? c.status !== "Forming" : false;
  const name = names.circle(circle, suggested || `Circle of ${p.n}`);

  async function join() {
    setBusy(true);
    setErr(null);
    try {
      // First visit: this single Face ID creates the account and the same session signs the join.
      // Returning users confirm joining a new circle with Face ID.
      const acct = session.account ? await session.confirm() : await session.create("");
      const me = acct.address;
      const calls = joinCalls(me, circle, { contribution: p.contribution, entryDeposit: p.entryDeposit, period: p.period, n: p.n }, secret, currency);
      if (config.testToken && (await balanceOf(me)) < p.entryDeposit) calls.unshift(...testDollarsCall(me, p.contribution * 3n));
      await run(acct, calls);
      track("firstTx");
      if (suggested) names.remember(circle, suggested);
      await qc.invalidateQueries();
      router.push(`/circle/${circle}?joined=1`);
    } catch (e) {
      setErr((e as Error).message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="You're invited" back="/" nav={false}>
      <Card className="text-center">
        <p className="text-4xl">🤝</p>
        <h1 className="mt-2 text-2xl font-extrabold" data-testid="circle-name">{name}</h1>
        <p className="mt-1 text-muted">
          {c?.memberCount ?? 0} of {p.n} people have joined
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-extrabold">How this circle works</h2>
        <Rule icon="💰">
          Everyone puts in <b>{fmt(p.contribution, currency, rates)}</b> every {duration(p.period)}.
        </Rule>
        <Rule icon="🎁">
          Each round, one person receives <b>{fmt(pot, currency, rates)}</b>. There are {p.n} rounds, so everyone gets a turn.
        </Rule>
        {auction ? (
          <Rule icon="⏱️">
            Need it sooner? Offer a small discount to receive earlier. Discounts are shared with everyone else.
          </Rule>
        ) : (
          <Rule icon="📋">People receive in the order they joined.</Rule>
        )}
        <Rule icon="🛡️">
          You put down a <b>{fmt(p.entryDeposit, currency, rates)}</b> deposit, returned at the end. If someone misses a payment, deposits and a shared
          safety fund cover it, so you still get your full turn.
        </Rule>
        <Rule icon="🔁">
          <b>Auto-pay is on.</b> Your contribution is collected automatically each round, for this circle only and never more than{" "}
          {fmt(p.contribution, currency, rates)}. You can turn it off any time in Settings.
        </Rule>
      </Card>

      {!inviteOk && <Notice tone="bad">This invite link isn't valid anymore. Ask for a fresh one.</Notice>}
      {full && !already && <Notice>This circle already has everyone it needs.</Notice>}
      {err && <Notice tone="bad">{err}</Notice>}

      {already ? (
        <Button onClick={() => router.push(`/circle/${circle}`)}>You're in. Open the circle</Button>
      ) : (
        <>
          <Button loading={busy} disabled={!inviteOk || full} onClick={join} data-testid="join">
            {session.address ? "Join with Face ID" : "Join with Face ID (creates your account)"}
          </Button>
          <div className="flex justify-center">
            <Pill tone="primary">No fees · no passwords · takes seconds</Pill>
          </div>
          {!session.address && (
            <button className="text-sm font-semibold text-primary" onClick={() => void session.signIn().catch(() => {})}>
              I already use Turn
            </button>
          )}
        </>
      )}
    </Screen>
  );
}

function Rule({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p className="flex gap-3 text-sm leading-relaxed">
      <span aria-hidden className="text-lg">
        {icon}
      </span>
      <span>{children}</span>
    </p>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Join />
    </Suspense>
  );
}
