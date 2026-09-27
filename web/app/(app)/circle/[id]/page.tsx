"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { Feedback } from "@/components/feedback";
import { RequireAccount } from "@/components/gate";
import { Icon } from "@/components/icons";
import { UnlockNames, useNames } from "@/components/names";
import { usePrefs } from "@/components/providers";
import { ShareInvite } from "@/components/share";
import { Avatar, Button, Card, Confetti, Notice, Pill, Screen, SectionTitle, Sheet, Skeleton, useToast } from "@/components/ui";
import { TurnWheel } from "@/components/wheel";
import { bidCall, claimCall, payNowCall, run } from "@/lib/actions";
import { memberInfo } from "@/lib/chain";
import { countdown, useNow } from "@/lib/hooks";
import { circleDetail } from "@/lib/indexer";
import { inviteLink } from "@/lib/invite";
import { duration, fmt } from "@/lib/money";
import { inviteSecret } from "@/lib/passkey";
import { useSession } from "@/lib/session";

/** While someone is looking at a live circle, ask the in-app keeper to run anything that's due (collect, close
 *  bidding, pay out, mark a default). The server reads the circle's own nextAction(); if nothing is due it's a no-op. */
function useKeeperPing(circle: string, live: boolean) {
  useEffect(() => {
    if (!live) return;
    let stop = false;
    const ping = () =>
      fetch("/api/keeper", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ circle }) }).catch(() => {});
    void ping();
    const t = setInterval(() => !stop && void ping(), 8_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [circle, live]);
}

function CirclePage() {
  const { id } = useParams<{ id: string }>();
  const circle = (isAddress(id) ? getAddress(id) : id) as Address;
  const joined = useSearchParams().get("joined") === "1";
  const { address, ensureAccount, account, confirm, unlock } = useSession();
  const { currency, rates } = usePrefs();
  const names = useNames();
  const toast = useToast();
  const qc = useQueryClient();
  const now = useNow();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bid, setBid] = useState(500);
  const [bidOpen, setBidOpen] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  const d = useQuery({ queryKey: ["circle", circle], queryFn: () => circleDetail(circle), refetchInterval: 1_500 });
  const mine = useQuery({
    queryKey: ["memberInfo", circle, address],
    queryFn: () => memberInfo(circle, address as Address),
    enabled: Boolean(address),
    refetchInterval: 3_000,
  });

  const c = d.data?.Circle[0];
  useKeeperPing(circle, c?.status === "Active");
  const rounds = useMemo(() => d.data?.Round ?? [], [d.data]);
  const seats = d.data?.Membership ?? [];
  const me = seats.find((s) => s.member_id.toLowerCase() === address?.toLowerCase());
  const current = rounds.find((r) => r.number === c?.currentRound);
  const myPayment = d.data?.Payment.find((p) => p.round_id === current?.id && p.member_id.toLowerCase() === address?.toLowerCase());

  // Celebrate joining, and a payout to me in the last two minutes; each celebration shows once.
  const recentWin = rounds.find(
    (r) => r.status === "PaidOut" && r.winner_id?.toLowerCase() === address?.toLowerCase() && r.paidOutAt && now - Number(r.paidOutAt) < 120,
  );
  const celebrating = [joined ? "join" : null, recentWin ? `round-${recentWin.number}` : null].find((k) => k && !dismissed.has(k)) ?? null;
  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => setDismissed((prev) => new Set(prev).add(celebrating)), 3000);
    return () => clearTimeout(t);
  }, [celebrating]);

  if (d.isLoading)
    return (
      <Screen title="Circle" back="/home">
        <Skeleton className="mx-auto mt-4 h-[280px] w-[280px] rounded-full" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </Screen>
    );
  if (!c)
    return (
      <Screen title="Circle" back="/home">
        <Notice icon="clock">We can&apos;t find this circle yet. If you just created it, give it a few seconds.</Notice>
      </Screen>
    );

  const title = names.circle(circle, `Circle of ${c.size}`);
  const pot = BigInt(c.contribution) * BigInt(c.activeCount || c.size);
  const start = Number(current?.start ?? 0);
  const bidEnds = start + c.bidWindow;
  const biddingOpen = Boolean(c.status === "Active" && c.mode === "Auction" && current && !current.settlement && current.status === "Open" && now < bidEnds);
  const withdrawable = mine.data?.withdrawable ?? 0n;
  const myReceived = me?.hasWon ? rounds.find((r) => r.number === me.wonRound) : undefined;
  const isCreator = address?.toLowerCase() === c.creator_id.toLowerCase();
  const canBid = biddingOpen && me && !me.hasWon && me.status === "Active";
  const needsPay = c.status === "Active" && current && !current.settlement && !myPayment && me?.status === "Active" && now > start + 5;
  const doneRounds = rounds.filter((r) => r.status === "PaidOut" && !r.settlement).length;
  const progress = c.status === "Completed" ? 1 : doneRounds / Math.max(1, c.totalRounds);
  const discount = (pot * BigInt(bid)) / 10_000n;

  async function act(label: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      await qc.invalidateQueries();
      if (done) toast(done);
    } catch (e) {
      setErr((e as Error).message || "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const status =
    c.status === "Forming" ? (
      <Pill tone="accent">
        <Icon name="users" size={13} /> Waiting · {c.memberCount}/{c.size}
      </Pill>
    ) : c.status === "Active" ? (
      <Pill tone="good">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-good" />
        Round {c.currentRound} of {c.totalRounds}
      </Pill>
    ) : (
      <Pill tone="primary">
        <Icon name="check" size={13} strokeWidth={3} /> Complete
      </Pill>
    );

  return (
    <Screen title={title} back="/home" action={<UnlockNames compact />}>
      {celebrating && <Confetti />}

      {/* Hero: the wheel */}
      <section className="rise flex flex-col items-center gap-3 pt-2">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {status}
          {current?.settlement && <Pill tone="warn">Settling up</Pill>}
          {biddingOpen && (
            <Pill tone="accent">
              <Icon name="bolt" size={13} /> Bidding · {countdown(bidEnds - now)}
            </Pill>
          )}
        </div>
        <TurnWheel
          members={seats.map((s) => ({
            address: s.member_id,
            name: names.personName(s.member_id),
            received: s.hasWon,
            me: s.member_id.toLowerCase() === address?.toLowerCase(),
            out: s.status === "Ejected",
          }))}
          current={current?.winner_id ?? null}
          progress={c.status === "Forming" ? c.memberCount / Math.max(1, c.size) : progress}
        >
          {c.status === "Forming" ? (
            <>
              <span className="text-xs font-semibold text-muted">Waiting for</span>
              <span className="font-display text-4xl font-extrabold">{c.size - c.memberCount}</span>
              <span className="text-xs font-semibold text-muted">{c.size - c.memberCount === 1 ? "more person" : "more people"}</span>
            </>
          ) : c.status === "Completed" ? (
            <>
              <span className="pop text-3xl">🎉</span>
              <span className="font-display text-lg font-extrabold">All done</span>
              <span className="text-xs text-muted">Everyone had a turn</span>
            </>
          ) : (
            <>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">This round&apos;s pot</span>
              <span className="num font-display text-[26px] font-extrabold leading-tight" data-testid="pot">
                {fmt(pot, currency, rates)}
              </span>
              <span className="text-xs text-muted">
                {current?.paidCount ?? 0} of {c.activeCount} paid
              </span>
            </>
          )}
        </TurnWheel>
        {c.status === "Active" && current && (
          <p className="text-center text-sm text-muted">
            {current.winner_id ? (
              <>
                Going to <b className="text-ink">{names.person(current.winner_id)}</b>
              </>
            ) : biddingOpen ? (
              current.bestBidBps != null ? (
                <>
                  Best offer <b className="text-ink">{(current.bestBidBps / 100).toFixed(1)}%</b> from {names.person(current.bestBidder_id!)}
                </>
              ) : (
                "No offers yet. If nobody offers, the best savings record receives it."
              )
            ) : (
              "Choosing who receives…"
            )}
          </p>
        )}
      </section>

      {/* You */}
      {me && (
        <Card className="rise-2 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${myReceived ? "bg-good-soft text-good" : me.status === "Ejected" ? "bg-bad-soft text-bad" : "bg-primary-soft text-primary"}`}>
              <Icon name={myReceived ? "gift" : me.status === "Ejected" ? "info" : "clock"} size={21} />
            </span>
            <div className="min-w-0 flex-1">
              {me.status === "Ejected" ? (
                <p className="text-sm">
                  You left after missed payments. <b>{fmt(me.refundDue, currency, rates)}</b> comes back to you when it ends.
                </p>
              ) : myReceived ? (
                <p className="font-bold text-good">You received {fmt(myReceived.netPaid ?? "0", currency, rates)} in round {me.wonRound}</p>
              ) : (
                <p className="font-bold">Your turn is coming</p>
              )}
              {c.status === "Active" && current && !current.settlement && me.status === "Active" && (
                <p className="text-xs text-muted">
                  This round:{" "}
                  {myPayment ? (
                    myPayment.kind === "Paid" ? (
                      <span className="font-bold text-good">Paid ✓</span>
                    ) : (
                      <span className="font-bold text-warn">Covered by your deposit</span>
                    )
                  ) : (
                    <span className="font-bold text-warn">Waiting for payment</span>
                  )}
                </p>
              )}
            </div>
          </div>
          {(needsPay || withdrawable > 0n || canBid) && (
            <div className="flex flex-col gap-2">
              {canBid && (
                <Button variant="accent" icon="bolt" onClick={() => setBidOpen(true)}>
                  Want the pot this round?
                </Button>
              )}
              {needsPay && (
                <Button
                  variant="secondary"
                  icon="arrowUp"
                  loading={busy === "pay"}
                  onClick={() =>
                    act(
                      "pay",
                      async () => {
                        const acct = await ensureAccount();
                        await run(acct, payNowCall(circle, acct.address));
                      },
                      "Paid for this round",
                    )
                  }
                >
                  Pay {fmt(c.contribution, currency, rates)} now
                </Button>
              )}
              {withdrawable > 0n && (
                <Button
                  icon="wallet"
                  loading={busy === "claim"}
                  onClick={() =>
                    act(
                      "claim",
                      async () => {
                        const acct = await confirm(); // withdrawals always ask for Face ID
                        await run(acct, claimCall(circle));
                      },
                      "Moved to your money",
                    )
                  }
                >
                  Withdraw {fmt(withdrawable, currency, rates)}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {err && (
        <Notice tone="bad" icon="info">
          {err}
        </Notice>
      )}

      {/* Invite (creator, while forming): rebuilt from the passkey's invite namespace */}
      {c.status === "Forming" && isCreator && (
        <Card className="rise-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-warn">
              <Icon name="link" size={20} />
            </span>
            <div>
              <h2 className="font-extrabold">Invite people</h2>
              <p className="text-xs text-muted">Only people with this link can join.</p>
            </div>
          </div>
          {invite ? (
            <ShareInvite link={invite} circleName={title} amount={fmt(c.contribution, currency, rates)} />
          ) : (
            <Button
              variant="secondary"
              icon="link"
              loading={busy === "invite"}
              onClick={() =>
                act("invite", async () => {
                  const s = await inviteSecret(await unlock("invite"), circle);
                  setInvite(inviteLink(circle, s, names.unlocked ? title : ""));
                })
              }
            >
              Show invite link
            </Button>
          )}
        </Card>
      )}

      {/* Rounds */}
      {c.status !== "Forming" && (
        <>
          <SectionTitle>Who receives when</SectionTitle>
          <Card className="p-2">
            <ol className="flex flex-col">
              {Array.from({ length: c.totalRounds }, (_, i) => i + 1).map((n) => {
                const r = rounds.find((x) => x.number === n && !x.settlement);
                const who = r?.winner_id;
                const paid = r?.status === "PaidOut";
                const isNow = n === c.currentRound && c.status === "Active";
                return (
                  <li key={n} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${isNow ? "bg-primary-soft" : ""}`}>
                    <span
                      className={`num flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${paid ? "bg-primary text-primary-ink" : isNow ? "bg-accent text-[#2a1a05]" : "bg-surface-2 text-muted"}`}
                    >
                      {paid ? <Icon name="check" size={14} strokeWidth={3} /> : n}
                    </span>
                    <span className={`flex-1 ${isNow ? "font-bold" : ""}`}>{who ? names.person(who) : isNow ? "This round" : `Round ${n}`}</span>
                    <span className="num text-muted">
                      {paid ? fmt(BigInt(r.pot ?? "0") - (BigInt(r.pot ?? "0") * BigInt(r.discountBps ?? 0)) / 10_000n, currency, rates) : isNow ? "now" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
        </>
      )}

      {/* Members */}
      <SectionTitle>People · {seats.length}</SectionTitle>
      <Card className="p-2">
        <ul className="flex flex-col">
          {seats.map((s) => {
            const paid = d.data?.Payment.find((p) => p.round_id === current?.id && p.member_id === s.member_id);
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                <Avatar seed={s.member_id} name={names.personName(s.member_id)} />
                <div className="min-w-0 flex-1">
                  <MemberName address={s.member_id} />
                  <p className="truncate text-xs text-muted">
                    {s.paymentsOnTime} on time{s.defaults ? ` · ${s.defaults} missed` : ""}
                    {s.hasWon ? ` · received round ${s.wonRound}` : ""}
                  </p>
                </div>
                {s.status === "Ejected" ? (
                  <Pill tone="bad">Left</Pill>
                ) : c.status === "Active" && current && !current.settlement ? (
                  paid ? (
                    <Pill tone={paid.kind === "Paid" ? "good" : "warn"}>{paid.kind === "Paid" ? "Paid" : "Covered"}</Pill>
                  ) : (
                    <Pill>Waiting</Pill>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: "repeat" as const, label: `Every ${duration(c.period)}`, value: fmt(c.contribution, currency, rates) },
          { icon: "shield" as const, label: "Safety fund", value: fmt(c.reserveBalance, currency, rates) },
          { icon: "chart" as const, label: "Health", value: `${c.healthScore}/100` },
        ].map((x) => (
          <div key={x.label} className="rounded-2xl bg-surface-2 p-3">
            <Icon name={x.icon} size={16} className="text-muted" />
            <p className="mt-1.5 text-[11px] font-semibold text-muted">{x.label}</p>
            <p className="num truncate text-xs font-extrabold">{x.value}</p>
          </div>
        ))}
      </div>

      {myReceived && <Feedback circle={circle} />}

      {/* Bid sheet */}
      <Sheet open={bidOpen && canBid === true} onClose={() => setBidOpen(false)} title="Take the pot early">
        <p className="text-sm text-muted">
          Offer a small discount to receive this round&apos;s pot now. The biggest offer wins when bidding closes in{" "}
          <b className="num text-ink">{countdown(bidEnds - now)}</b>.
        </p>
        <div className="rounded-3xl bg-surface-2 p-5 text-center">
          <p className="text-xs font-semibold text-muted">You&apos;d receive</p>
          <p className="num font-display text-4xl font-extrabold text-primary">{fmt(pot - discount, currency, rates)}</p>
          <p className="mt-1 text-xs text-muted">
            {fmt((discount * 8n) / 10n, currency, rates)} is shared with the others as savings
          </p>
        </div>
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-semibold">Your offer</span>
            <b className="num">{(bid / 100).toFixed(1)}%</b>
          </div>
          <input
            type="range"
            min={0}
            max={c.maxDiscountBps}
            step={50}
            value={bid}
            onChange={(e) => setBid(Number(e.target.value))}
            aria-label="Discount you offer"
            className="w-full accent-[var(--primary)]"
          />
          {current?.bestBidBps != null && (
            <p className="mt-1 text-xs text-muted">
              Best so far: {(current.bestBidBps / 100).toFixed(1)}% from {names.person(current.bestBidder_id!)}
            </p>
          )}
        </div>
        <Button
          icon="bolt"
          loading={busy === "bid"}
          onClick={() =>
            act(
              "bid",
              async () => {
                // Small offers use the open session; larger ones ask for Face ID.
                const acct = bid > 1000 || !account ? await confirm() : account;
                await run(acct, bidCall(circle, bid));
                setBidOpen(false);
              },
              "Offer placed",
            )
          }
        >
          Offer {(bid / 100).toFixed(1)}%
        </Button>
      </Sheet>
    </Screen>
  );
}

function MemberName({ address }: { address: string }) {
  const names = useNames();
  const [editing, setEditing] = useState(false);
  const stored = names.personName(address) ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? stored;
  const label = names.person(address);
  if (!names.unlocked || label === "You") return <p className="truncate font-semibold">{label}</p>;
  if (editing)
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await names.setPerson(address, value);
          setEditing(false);
        }}
        className="flex gap-2"
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1 text-sm"
          placeholder="e.g. Mom"
        />
        <button className="text-sm font-bold text-primary">Save</button>
      </form>
    );
  return (
    <button className="flex items-center gap-1 text-left font-semibold" onClick={() => setEditing(true)}>
      {label} <Icon name="settings" size={12} className="text-primary" />
    </button>
  );
}

export default function Page() {
  return (
    <RequireAccount title="Circle">
      <Suspense>
        <CirclePage />
      </Suspense>
    </RequireAccount>
  );
}
