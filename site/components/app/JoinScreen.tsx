"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getAddress, isAddress, keccak256, zeroHash, type Address, type Hex } from "viem";
import { TurnRing } from "@/components/ring/TurnRing";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDate, useFrequencyText, useMoney } from "@/lib/app/hooks";
import { frequencyOf } from "@/lib/app/templates";
import { useT } from "@/lib/i18n";
import { joinCalls, run } from "@/lib/live/actions";
import { passkeyErrorKind } from "@/lib/live/capability";
import { circleInviteHash, circleParams } from "@/lib/live/chain";
import { isTestnet } from "@/lib/live/config";
import { topUpFor } from "@/lib/live/funds";
import { circleDetail } from "@/lib/live/indexer";
import { setFlow, startRun, tap } from "@/lib/live/metrics";
import { useNames } from "@/lib/live/names";
import { useSession } from "@/lib/live/session";
import { useApp } from "./AppProvider";
import { circleFallbackName } from "./CircleCard";

/**
 * Join from an invite link. For someone new, this one Face ID creates their account and signs the join: approve the
 * deposit, join, and grant auto-pay, in one transaction the relayer pays for. They never hold MON.
 */
export function JoinScreen({ code }: { code: string }) {
  const t = useT();
  const q = useSearchParams();
  const secret = (q.get("s") ?? "") as Hex;
  const suggested = (q.get("n") ?? "").slice(0, 40);
  const router = useRouter();
  const { receipt } = useApp();
  const { fmt, currency } = useMoney();
  const freq = useFrequencyText();
  const date = useDate();
  const session = useSession();
  const names = useNames();
  const [yourName, setYourName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = isAddress(code);
  const circle = (valid ? getAddress(code) : code) as Address;

  useEffect(() => startRun("join"), []);

  const info = useQuery({
    queryKey: ["join", circle],
    enabled: valid,
    queryFn: async () => {
      const [p, hash, idx] = await Promise.all([circleParams(circle), circleInviteHash(circle), circleDetail(circle)]);
      return { p, hash, c: idx.Circle[0], members: idx.Membership };
    },
    refetchInterval: 5_000,
  });

  if (!valid) return <EmptyState title={t("join.invalid")} action={<HomeLink />} />;
  if (info.isError) return <EmptyState title={t("live.notFound")} action={<HomeLink />} />;
  if (!info.data)
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="mx-auto h-10 w-2/3" />
        <Skeleton className="mx-auto size-64 rounded-full" />
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
    );

  const { p, hash, c, members } = info.data;
  const inviteOk = hash === zeroHash || (/^0x[0-9a-fA-F]{64}$/.test(secret) && keccak256(secret) === hash);
  const already = session.address && members.some((m) => m.member_id.toLowerCase() === session.address!.toLowerCase());
  const full = c ? c.status !== "Forming" : false;
  const title = names.circle(circle, suggested || circleFallbackName(t, { size: p.n }));
  const f = frequencyOf(p.period);
  const joinedCount = c?.memberCount ?? members.length;
  const seats = [
    ...members.map((m) => ({ name: names.person(m.member_id, t("common.you")) })),
    ...(already ? [] : [{ name: yourName.trim() || t("common.you") }]),
  ];
  const end = new Date(Date.now() + p.n * p.period * 1000);

  async function join() {
    tap();
    setFlow("join");
    setBusy(true);
    setErr(null);
    try {
      // New here: this one Face ID creates the account and the same session signs the join.
      // Returning (even after a refresh): confirm with the passkey you already have; never a second account.
      const acct = session.address ? await session.confirm() : await session.create(yourName.trim());
      if (!session.address && yourName.trim()) await names.setMe(yourName.trim());
      const calls = joinCalls(acct.address, circle, { contribution: p.contribution, entryDeposit: p.entryDeposit, period: p.period, n: p.n }, secret, currency);
      calls.unshift(...(await topUpFor(acct.address, p.entryDeposit)));
      const { txHash } = await run(acct, calls);
      if (suggested) names.remember(circle, suggested);
      receipt(t("join.joined"), txHash, t("join.whatNext", { amount: fmt(p.entryDeposit) }));
      router.push(`/app/circle/${circle}?joined=1`);
    } catch (e) {
      const kind = passkeyErrorKind(e);
      setErr(kind === "cancelled" ? t("live.cancelled") : kind === "unsupported" ? t("live.noPrf") : (e as Error).message || t("errors.generic"));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <p className="text-ink-muted">{t("live.invitedTo")}</p>
        <h1 className="mt-1 text-4xl" data-testid="circle-name">
          {title}
        </h1>
      </div>

      <div className="mx-auto w-full max-w-72">
        <TurnRing
          members={seats}
          step={Math.max(0, seats.length - 1)}
          label={t("join.seats", { joined: joinedCount, total: p.n })}
          center={<span className="text-ink-muted text-sm font-semibold">{t("join.seats", { joined: joinedCount, total: p.n })}</span>}
        />
      </div>

      <section className="bg-paper-raised border-line shadow-soft overflow-hidden rounded-card border">
        <p className="sr-only">{t("join.summary", { people: t("common.people", { count: p.n }), amount: fmt(p.contribution), frequency: freq.word(f), duration: freq.duration(f, p.n) })}</p>
        <dl aria-hidden className="divide-line grid grid-cols-3 divide-x text-center">
          {[
            { value: fmt(p.contribution), label: freq.word(f) },
            { value: String(p.n), label: t("join.statLabels.people") },
            { value: freq.duration(f, p.n), label: p.mode === 1 ? t("create.bid") : t("create.order") },
          ].map((s, i) => (
            <div key={i} className="flex flex-col gap-0.5 px-2 py-4">
              <dd className="tabular text-lg font-semibold">{s.value}</dd>
              <dt className="text-ink-muted text-xs">{s.label}</dt>
            </div>
          ))}
        </dl>
        <p className="bg-teal-soft text-teal-ink px-4 py-3 text-center text-sm font-semibold">{t("join.receive", { pot: fmt(p.contribution * BigInt(p.n)) })}</p>
      </section>

      <Card tone="sunk" className="flex gap-3">
        <svg viewBox="0 0 24 24" className="text-success mt-0.5 size-6 shrink-0" aria-hidden>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div>
          <p className="font-semibold">{t("join.autopayTitle")}</p>
          <p className="text-ink-muted mt-1 text-sm">{t("join.autopayBody", { amount: fmt(p.contribution), frequency: freq.word(f), until: date(end, true) })}</p>
        </div>
      </Card>

      {!inviteOk && <p className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-sm">{t("join.invalid")}</p>}
      {full && !already && <p className="bg-paper-sunk rounded-xl px-4 py-3 text-sm">{t("join.full")}</p>}

      {already ? (
        <Button size="lg" onClick={() => router.push(`/app/circle/${circle}`)}>
          {t("join.already")}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          {!session.address && (
            <div className="flex flex-col gap-2">
              <label htmlFor="join-name" className="text-sm font-semibold">
                {t("join.yourName")}
              </label>
              <input
                id="join-name"
                value={yourName}
                onChange={(e) => setYourName(e.target.value)}
                placeholder={t("create.yourNamePlaceholder")}
                autoComplete="given-name"
                maxLength={30}
                className="border-line-strong bg-paper-raised min-h-12 rounded-xl border px-4"
              />
              <p className="text-ink-muted text-xs">{t("live.yourNameHint")}</p>
            </div>
          )}
          <p className="text-ink-muted text-sm">{t("join.whatNext", { amount: fmt(p.entryDeposit) })}</p>
          {isTestnet && <p className="text-ink-muted text-xs">{t("live.testMoneyDeposit")}</p>}
          {err && (
            <p role="alert" className="text-danger text-sm">
              {err}
            </p>
          )}
          <Button size="lg" onClick={join} busy={busy} disabled={!inviteOk || full} data-testid="join">
            {t("join.confirm")}
          </Button>
          <p className="text-ink-muted text-center text-xs">{session.address ? t("live.noFees") : t("live.joinCreatesAccount")}</p>
          {!session.address && (
            <Button variant="ghost" disabled={busy} onClick={() => session.signIn().catch(() => {})}>
              {t("live.haveAccount")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function HomeLink() {
  const t = useT();
  return (
    <Link href="/app" className="text-teal-ink min-h-11 font-semibold underline">
      {t("nav.home")}
    </Link>
  );
}
