"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { type SeatStatus, TurnRing } from "@/components/ring/TurnRing";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useFrequencyText, useMoney } from "@/lib/app/hooks";
import { frequencyOf } from "@/lib/app/templates";
import { useT } from "@/lib/i18n";
import { bidCall, claimCall, payNowCall, run } from "@/lib/live/actions";
import { memberInfo } from "@/lib/live/chain";
import { addressUrl } from "@/lib/live/config";
import { useCircle, useNow } from "@/lib/live/hooks";
import { useNames } from "@/lib/live/names";
import { QUICK_BID_BPS, useSession } from "@/lib/live/session";
import { useApp } from "./AppProvider";
import { BidSheet } from "./BidSheet";
import { Celebration } from "./Celebration";
import { circleFallbackName, health, type Health } from "./CircleCard";
import { ShareInvite } from "./ShareInvite";

const healthTone: Record<Health, "success" | "warning" | "danger" | "neutral" | "trust"> = {
  green: "success",
  amber: "warning",
  red: "danger",
  forming: "neutral",
  done: "trust",
};

/** While someone looks at a running circle, ask the in-app keeper to run whatever is due (collect, close bidding,
 *  pay out, mark a default). It reads the circle's own nextAction(); when nothing is due it does nothing. */
function useKeeperPing(circle: string, live: boolean) {
  useEffect(() => {
    if (!live) return;
    const ping = () => fetch("/api/keeper", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ circle }) }).catch(() => {});
    void ping();
    const id = window.setInterval(ping, 8_000);
    return () => window.clearInterval(id);
  }, [circle, live]);
}

function countdown(seconds: number) {
  if (seconds <= 0) return "0:00";
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CircleScreen({ id }: { id: string }) {
  const t = useT();
  if (!isAddress(id)) return <EmptyState title={t("live.notFound")} action={<HomeLink />} />;
  return <CircleView circle={getAddress(id)} />;
}

function CircleView({ circle }: { circle: Address }) {
  const t = useT();
  const params = useSearchParams();
  const { address, quick, confirm } = useSession();
  const { fmt } = useMoney();
  const freq = useFrequencyText();
  const names = useNames();
  const { receipt } = useApp();
  const qc = useQueryClient();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bidOpen, setBidOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(params.get("joined") === "1" || params.get("created") === "1");
  const celebrated = useRef(new Set<number>());

  const d = useCircle(circle);
  const mine = useQuery({
    queryKey: ["memberInfo", circle, address],
    queryFn: () => memberInfo(circle, address as Address),
    enabled: Boolean(address),
    refetchInterval: 3_000,
  });
  const c = d.data?.Circle[0];
  useKeeperPing(circle, c?.status === "Active");

  const rounds = d.data?.Round ?? [];
  const seats = d.data?.Membership ?? [];
  const me = seats.find((s) => s.member_id.toLowerCase() === address?.toLowerCase());
  const current = rounds.find((r) => r.number === c?.currentRound && !r.settlement) ?? rounds.find((r) => r.number === c?.currentRound);
  const recentWin = rounds.find((r) => r.status === "PaidOut" && r.winner_id?.toLowerCase() === address?.toLowerCase() && r.paidOutAt && now - Number(r.paidOutAt) < 120);

  // Celebrate joining or starting a circle, and a payout to you in the last two minutes, once each.
  useEffect(() => {
    if (recentWin && !celebrated.current.has(recentWin.number)) {
      celebrated.current.add(recentWin.number);
      setCelebrate(true);
    }
  }, [recentWin]);
  useEffect(() => {
    if (!celebrate) return;
    const id = window.setTimeout(() => setCelebrate(false), 2600);
    return () => window.clearTimeout(id);
  }, [celebrate]);

  if (d.isLoading)
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="mx-auto size-72 rounded-full" />
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
    );
  if (!c) return <EmptyState title={t("live.notIndexedYet")} body={t("live.notIndexedYetBody")} action={<HomeLink />} />;

  const title = names.circle(circle, circleFallbackName(t, c));
  const f = frequencyOf(c.period);
  const h = health(c);
  const pot = BigInt(c.contribution) * BigInt(c.activeCount || c.size);
  const start = Number(current?.start ?? 0);
  const bidEnds = start + c.bidWindow;
  const auction = c.mode === "Auction";
  const biddingOpen = Boolean(c.status === "Active" && auction && current && !current.settlement && current.status === "Open" && now < bidEnds);
  const paidThisRound = (member: string) => d.data?.Payment.find((p) => p.round_id === current?.id && p.member_id.toLowerCase() === member.toLowerCase());
  const myPayment = address ? paidThisRound(address) : undefined;
  const withdrawable = mine.data?.withdrawable ?? 0n;
  const myReceived = me?.hasWon ? rounds.find((r) => r.number === me.wonRound && !r.settlement) : undefined;
  const isCreator = address?.toLowerCase() === c.creator_id.toLowerCase();
  const canBid = Boolean(biddingOpen && me && !me.hasWon && me.status === "Active");
  const needsPay = Boolean(c.status === "Active" && current && !current.settlement && !myPayment && me?.status === "Active" && now > start + 5);
  const others = Math.max(0, (c.activeCount || c.size) - 1);

  const sub =
    c.status === "Forming"
      ? t("circle.forming", { joined: c.memberCount, total: c.size })
      : c.status === "Completed"
        ? t("circle.complete")
        : current?.settlement
          ? t("circle.settling")
          : t("live.roundOf", { round: c.currentRound, total: c.totalRounds });

  const ringMembers = seats.map((s) => {
    const paid = paidThisRound(s.member_id);
    const status: SeatStatus = paid ? (paid.kind === "Paid" ? "paid" : "late") : "pending";
    return { name: names.person(s.member_id, t("common.you")), status };
  });
  const winnerIndex = current?.winner_id ? seats.findIndex((s) => s.member_id.toLowerCase() === current.winner_id!.toLowerCase()) : -1;

  async function act(label: string, fn: () => Promise<{ txHash: string }>, done: string) {
    setBusy(label);
    setErr(null);
    try {
      const { txHash } = await fn();
      receipt(done, txHash);
      await qc.invalidateQueries();
    } catch (e) {
      setErr((e as Error).message || t("errors.generic"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {celebrate && <Celebration />}
      <div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl">{title}</h1>
          <Badge tone={healthTone[h]} dot className="mt-2">
            {t(`home.health.${h}`)}
          </Badge>
        </div>
        <p className="text-ink-muted mt-1">{sub}</p>
      </div>

      {c.status === "Forming" && isCreator && (
        <ShareInvite circle={circle} name={title} size={c.size} joined={c.memberCount} contribution={BigInt(c.contribution)} frequency={f} />
      )}

      <div className="mx-auto w-full max-w-80">
        <TurnRing
          members={ringMembers.length ? ringMembers : [{ name: t("common.you") }]}
          step={Math.max(0, winnerIndex)}
          marker={winnerIndex >= 0}
          showStatus={c.status === "Active"}
          center={
            c.status === "Forming" ? (
              <span className="text-ink-muted text-sm font-semibold">{t("join.seats", { joined: c.memberCount, total: c.size })}</span>
            ) : c.status === "Completed" ? (
              <span className="font-display text-xl">{t("circle.complete")}</span>
            ) : (
              <>
                <span className="text-ink-muted text-[0.7rem] font-semibold tracking-[0.12em] uppercase">{t("live.potLabel")}</span>
                <span className="tabular font-display mt-1 text-2xl" data-testid="pot">
                  {fmt(pot)}
                </span>
                <span className="text-marigold-ink mt-1 text-xs font-semibold">
                  {current?.winner_id
                    ? t("circle.turnOf", { name: names.person(current.winner_id, t("common.you")) })
                    : biddingOpen
                      ? `${t("circle.biddingOpen")} · ${countdown(bidEnds - now)}`
                      : t("live.paidCount", { paid: current?.paidCount ?? 0, total: c.activeCount })}
                </span>
              </>
            )
          }
        />
      </div>

      {me && (
        <Card className="flex flex-col gap-3">
          <p className="font-semibold">
            {me.status === "Ejected"
              ? t("live.youWereEjected", { amount: fmt(BigInt(me.refundDue)) })
              : myReceived
                ? t("live.youReceived", { amount: fmt(BigInt(myReceived.netPaid ?? "0")), round: me.wonRound ?? 0 })
                : c.status === "Forming"
                  ? t("live.waitingToStart")
                  : t("live.turnComing")}
          </p>
          {c.status === "Active" && current && !current.settlement && me.status === "Active" && (
            <p className="text-sm">
              {myPayment ? (
                myPayment.kind === "Paid" ? (
                  <span className="text-success font-semibold">{t("live.paidThisRound")}</span>
                ) : (
                  <span className="text-warning font-semibold">{t("live.coveredThisRound")}</span>
                )
              ) : (
                <span className="text-ink-muted">{t("live.autopayWillCollect", { amount: fmt(BigInt(c.contribution)) })}</span>
              )}
            </p>
          )}
          {(canBid || needsPay || withdrawable > 0n) && (
            <div className="flex flex-col gap-2">
              {canBid && (
                <Button size="lg" onClick={() => setBidOpen(true)}>
                  {t("circle.bid")}
                </Button>
              )}
              {needsPay && (
                <Button
                  size="lg"
                  variant="secondary"
                  busy={busy === "pay"}
                  onClick={() =>
                    act(
                      "pay",
                      async () => {
                        // Routine: the open session signs; no Face ID while it lasts.
                        const acct = await quick();
                        return run(acct, payNowCall(circle, acct.address));
                      },
                      t("live.paid"),
                    )
                  }
                >
                  {t("live.payNow", { amount: fmt(BigInt(c.contribution)) })}
                </Button>
              )}
              {withdrawable > 0n && (
                <Button
                  size="lg"
                  variant="outline"
                  busy={busy === "claim"}
                  onClick={() => act("claim", async () => run(await confirm(), claimCall(circle)), t("live.withdrawn"))}
                >
                  {t("live.withdraw", { amount: fmt(withdrawable) })}
                </Button>
              )}
            </div>
          )}
          {err && (
            <p role="alert" className="text-danger text-sm">
              {err}
            </p>
          )}
        </Card>
      )}

      {c.status !== "Forming" && (
        <section className="flex flex-col gap-2">
          <h2 className="text-ink-muted font-sans text-sm font-semibold tracking-normal">{t("live.whoWhen")}</h2>
          <ol className="bg-paper-raised border-line divide-line divide-y rounded-card border">
            {Array.from({ length: c.totalRounds }, (_, i) => i + 1).map((n) => {
              const r = rounds.find((x) => x.number === n && !x.settlement);
              const paidOut = r?.status === "PaidOut";
              const isNow = n === c.currentRound && c.status === "Active";
              return (
                <li key={n} className={`flex items-center gap-3 px-5 py-3 ${isNow ? "bg-marigold-soft/50" : ""}`}>
                  <span className="tabular text-ink-muted w-16 shrink-0 text-sm">{t("live.roundN", { round: n })}</span>
                  <span className={`flex-1 ${isNow ? "font-semibold" : ""}`}>
                    {r?.winner_id ? names.person(r.winner_id, t("common.you")) : isNow ? t("live.thisRound") : "—"}
                  </span>
                  <span className="tabular text-sm">
                    {paidOut && r?.netPaid ? fmt(BigInt(r.netPaid)) : ""}
                    {paidOut && r?.discountBps ? <span className="text-ink-muted"> · {t("circle.tlDiscount", { pct: (r.discountBps / 100).toFixed(1) })}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-ink-muted font-sans text-sm font-semibold tracking-normal">{t("live.people", { count: seats.length })}</h2>
        <ul className="bg-paper-raised border-line divide-line divide-y rounded-card border">
          {seats.map((s) => {
            const paid = paidThisRound(s.member_id);
            return (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{names.person(s.member_id, t("common.you"))}</p>
                  <p className="text-ink-muted truncate text-xs">
                    {t("live.memberLine", { onTime: s.paymentsOnTime, missed: s.defaults })}
                    {s.hasWon ? ` · ${t("live.receivedRound", { round: s.wonRound ?? 0 })}` : ""}
                  </p>
                </div>
                {s.status === "Ejected" ? (
                  <Badge tone="danger">{t("live.left")}</Badge>
                ) : c.status === "Active" && current && !current.settlement ? (
                  paid ? (
                    <Badge tone={paid.kind === "Paid" ? "success" : "warning"}>{t(paid.kind === "Paid" ? "live.statusPaid" : "live.statusCovered")}</Badge>
                  ) : (
                    <Badge>{t("live.statusWaiting")}</Badge>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: freq.word(f), value: fmt(BigInt(c.contribution)) },
          { label: t("live.safetyFund"), value: fmt(BigInt(c.reserveBalance)) },
          { label: t("live.health"), value: `${c.healthScore}/100` },
        ].map((x) => (
          <div key={x.label} className="bg-paper-sunk rounded-2xl p-3">
            <dt className="text-ink-muted text-xs">{x.label}</dt>
            <dd className="tabular truncate text-sm font-semibold">{x.value}</dd>
          </div>
        ))}
      </dl>
      <a href={addressUrl(circle)} target="_blank" rel="noopener noreferrer" className="text-teal-ink self-start text-sm font-semibold underline-offset-4 hover:underline">
        {t("live.viewContract")}
      </a>

      {canBid && (
        <BidSheet
          key={current?.id}
          open={bidOpen}
          onClose={() => setBidOpen(false)}
          pot={pot}
          maxBps={c.maxDiscountBps}
          bestBps={current?.bestBidBps ?? null}
          others={others}
          closesIn={countdown(bidEnds - now)}
          busy={busy === "bid"}
          onBid={(bps) =>
            act(
              "bid",
              async () => {
                // Small offers use the open session; larger ones ask for Face ID again.
                const acct = bps > QUICK_BID_BPS ? await confirm() : await quick();
                const res = await run(acct, bidCall(circle, bps));
                setBidOpen(false);
                return res;
              },
              t("live.offerPlaced", { pct: (bps / 100).toFixed(1) }),
            )
          }
        />
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
