"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDate, useMoney } from "@/lib/app/hooks";
import { useT } from "@/lib/i18n";
import { run, testDollarsCall } from "@/lib/live/actions";
import { faucetKind, isTestnet } from "@/lib/live/config";
import { requestTestAusd } from "@/lib/live/funds";
import { useBalance, useGrants, useMyCircles, useNow } from "@/lib/live/hooks";
import { useNames } from "@/lib/live/names";
import { useSession } from "@/lib/live/session";
import { Activity } from "./Activity";
import { useApp } from "./AppProvider";
import { CircleCard, circleFallbackName } from "./CircleCard";
import { InstallCard } from "./InstallCard";

/** MockAUSD mints this much per tap; Agora's faucet decides its own drip (10,000 test AUSD today). */
const MOCK_DRIP = 300n * 10n ** 6n;
const ausd = (units: bigint) => (Number(units) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
const WEEK = 7 * 86_400;

export function Home() {
  const t = useT();
  const { fmt } = useMoney();
  const date = useDate();
  const { address, quick } = useSession();
  const { receipt } = useApp();
  const names = useNames();
  const now = useNow(30_000);
  const balance = useBalance();
  const my = useMyCircles();
  const grants = useGrants();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const me = my.data?.Member[0];
  const seats = (my.data?.Membership ?? []).filter((m) => m.status !== "Left");
  const order = [...seats].sort((a, b) => Number(a.circle.status === "Completed") - Number(b.circle.status === "Completed"));
  const grantFor = (circle: string) => grants.data?.Session.find((g) => g.circle_id.toLowerCase() === circle.toLowerCase());
  const autopayOf = (circle: string) => {
    if (!grants.data) return null;
    const g = grantFor(circle);
    return Boolean(g && g.active && Number(g.validUntil) > now);
  };
  // Auto-pay that's off, expired, or ending within a week, for a circle that still needs it.
  const attention = seats
    .filter((s) => s.status === "Active" && s.circle.status !== "Completed")
    .map((s) => ({ s, g: grantFor(s.circle.id) }))
    .filter(({ g }) => grants.data && (!g || !g.active || Number(g.validUntil) < now + WEEK))[0];

  async function getTestMoney() {
    setBusy(true);
    setErr(null);
    try {
      if (faucetKind === "agora") {
        // Agora's faucet pays the recipient directly: no signature needed, the server covers the gas.
        const { txHash, amount } = await requestTestAusd(address!);
        receipt(t("live.testMoneyAdded", { amount: fmt(amount) }), txHash);
      } else {
        const acct = await quick();
        const { txHash } = await run(acct, testDollarsCall(acct.address, MOCK_DRIP));
        receipt(t("live.testMoneyAdded", { amount: fmt(MOCK_DRIP) }), txHash);
      }
      await balance.refetch();
    } catch (e) {
      setErr((e as Error).message || t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl">{names.me ? t("home.greeting", { name: names.me }) : t("live.hi")}</h1>
        <Link href="/app/score" className="bg-teal-soft text-teal-ink inline-flex min-h-11 items-center gap-2 rounded-pill px-4 text-sm font-semibold">
          <span className="tabular text-base">{me?.creditScore ?? 0}</span> {t("nav.score")}
        </Link>
      </div>

      <Card className="flex flex-col gap-3">
        <p className="text-ink-muted text-sm font-semibold">{t("live.yourMoney")}</p>
        <p className="font-display tabular text-4xl" data-testid="balance">
          {balance.data === undefined ? <Skeleton className="h-10 w-40" /> : fmt(balance.data)}
        </p>
        {balance.data !== undefined && (
          <p className="tabular text-ink-muted text-sm" data-testid="ausd-balance">
            {t("live.ausdBalance", { amount: ausd(balance.data) })}
          </p>
        )}
        <p className="text-ink-muted text-xs">{isTestnet ? t(faucetKind === "agora" ? "live.testAusdNote" : "live.testMoneyNote") : t("live.realMoneyNote")}</p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/app/send" variant="primary">
            {t("send.cta")}
          </ButtonLink>
          {faucetKind && (
            <Button variant="secondary" onClick={getTestMoney} busy={busy}>
              {faucetKind === "agora" ? t("live.getTestAusd") : t("live.getTestMoney", { amount: fmt(MOCK_DRIP) })}
            </Button>
          )}
        </div>
        {err && (
          <p role="alert" className="text-danger text-sm">
            {err}
          </p>
        )}
      </Card>

      {attention && (
        <Link href="/app/settings#autopay" data-testid="autopay-banner" className="bg-warning-soft flex flex-col gap-1 rounded-card p-4">
          <span className="font-semibold">
            {!attention.g || !attention.g.active
              ? t("live.autopayOffBanner", { circle: names.circle(attention.s.circle.id, circleFallbackName(t, attention.s.circle)) })
              : Number(attention.g.validUntil) < now
                ? t("live.autopayExpiredBanner", { circle: names.circle(attention.s.circle.id, circleFallbackName(t, attention.s.circle)) })
                : t("live.autopayEndingBanner", {
                    circle: names.circle(attention.s.circle.id, circleFallbackName(t, attention.s.circle)),
                    date: date(new Date(Number(attention.g.validUntil) * 1000), true),
                  })}
          </span>
          <span className="text-ink-muted text-sm">{t("live.autopayFix")}</span>
        </Link>
      )}

      <section aria-labelledby="circles-h" className="flex flex-col gap-3">
        <h2 id="circles-h" className="text-ink-muted font-sans text-sm font-semibold tracking-normal">
          {t("home.yourCircles")}
        </h2>
        {my.isLoading || !address ? (
          <>
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
          </>
        ) : order.length === 0 ? (
          <Card tone="sunk">
            <EmptyState title={t("home.emptyTitle")} body={t("home.emptyBody")} />
          </Card>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="circles">
            {order.map((s) => (
              <li key={s.id}>
                <CircleCard seat={s} autopay={autopayOf(s.circle.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Activity />

      <ButtonLink href="/app/create" size="lg">
        {t("home.start")}
      </ButtonLink>

      <InstallCard />
    </div>
  );
}
