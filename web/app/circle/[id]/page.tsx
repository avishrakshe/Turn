"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { Feedback } from "@/components/feedback";
import { RequireAccount } from "@/components/gate";
import { UnlockNames, useNames } from "@/components/names";
import { usePrefs } from "@/components/providers";
import { ShareInvite } from "@/components/share";
import { Avatar, Button, Card, Confetti, Notice, Pill, Screen } from "@/components/ui";
import { bidCall, claimCall, payNowCall, run } from "@/lib/actions";
import { memberInfo } from "@/lib/chain";
import { countdown, useNow } from "@/lib/hooks";
import { circleDetail } from "@/lib/indexer";
import { inviteLink } from "@/lib/invite";
import { duration, fmt } from "@/lib/money";
import { inviteSecret } from "@/lib/passkey";
import { useSession } from "@/lib/session";

function CirclePage() {
  const { id } = useParams<{ id: string }>();
  const circle = (isAddress(id) ? getAddress(id) : id) as Address;
  const joined = useSearchParams().get("joined") === "1";
  const { address, account, confirm, unlock } = useSession();
  const { currency, rates } = usePrefs();
  const names = useNames();
  const qc = useQueryClient();
  const now = useNow();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bid, setBid] = useState(500);
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
  const celebrate = celebrating !== null;
  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => setDismissed((prev) => new Set(prev).add(celebrating)), 3000);
    return () => clearTimeout(t);
  }, [celebrating]);

  if (d.isLoading) return <Screen title="Circle" back="/home"><p className="text-muted">Loading…</p></Screen>;
  if (!c) return <Screen title="Circle" back="/home"><Notice>We can't find this circle yet. If you just created it, give it a few seconds.</Notice></Screen>;

  const title = names.circle(circle, `Circle of ${c.size}`);
  const pot = BigInt(c.contribution) * BigInt(c.activeCount || c.size);
  const start = Number(current?.start ?? 0);
  const bidEnds = start + c.bidWindow;
  const biddingOpen = c.status === "Active" && c.mode === "Auction" && current && !current.settlement && current.status === "Open" && now < bidEnds;
  const withdrawable = mine.data?.withdrawable ?? 0n;
  const myReceived = me?.hasWon ? rounds.find((r) => r.number === me.wonRound) : undefined;
  const isCreator = address?.toLowerCase() === c.creator_id.toLowerCase();

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      await qc.invalidateQueries();
    } catch (e) {
      setErr((e as Error).message || "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const discount = (pot * BigInt(bid)) / 10_000n;

  return (
    <Screen title={title} back="/home" action={<UnlockNames compact />}>
      {celebrate && <Confetti />}

      {/* Hero */}
      <Card className={c.status === "Completed" ? "bg-accent-soft" : ""}>
        {c.status === "Forming" && (
          <>
            <Pill tone="accent">Waiting for people</Pill>
            <p className="mt-3 text-2xl font-extrabold">
              {c.size - c.memberCount} more {c.size - c.memberCount === 1 ? "person" : "people"} to go
            </p>
            <p className="text-sm text-muted">The first round starts as soon as everyone has joined.</p>
          </>
        )}
        {c.status === "Active" && current && (
          <>
            <div className="flex items-center gap-2">
              <Pill tone="good">
                Round {c.currentRound} of {c.totalRounds}
              </Pill>
              {current.settlement && <Pill tone="warn">Settling up</Pill>}
              {biddingOpen && (
                <Pill tone="accent">
                  <span className="live-dot">●</span> Bidding open
                </Pill>
              )}
            </div>
            <p className="mt-3 text-sm text-muted">This round's pot</p>
            <p className="num text-4xl font-extrabold" data-testid="pot">{fmt(pot, currency, rates)}</p>
            <p className="mt-1 text-sm text-muted">
              {current.paidCount} of {c.activeCount} paid ·{" "}
              {current.winner_id ? `going to ${names.person(current.winner_id)}` : biddingOpen ? `bids close in ${countdown(bidEnds - now)}` : "choosing who receives"}
            </p>
          </>
        )}
        {c.status === "Completed" && (
          <>
            <p className="text-4xl">🎉</p>
            <p className="mt-2 text-2xl font-extrabold">Circle complete</p>
            <p className="text-sm text-muted">Everyone had their turn. Deposits and any savings are ready to withdraw.</p>
          </>
        )}
      </Card>

      {/* You */}
      {me && (
        <Card className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-muted">You</p>
          {me.status === "Ejected" ? (
            <p>You left this circle after missed payments. {fmt(me.refundDue, currency, rates)} comes back to you when it ends.</p>
          ) : myReceived ? (
            <p className="font-bold text-good">
              You received {fmt(myReceived.netPaid ?? "0", currency, rates)} in round {me.wonRound} 🎉
            </p>
          ) : (
            <p className="font-bold">Your turn is coming</p>
          )}
          {c.status === "Active" && current && !current.settlement && (
            <p className="text-sm">
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
          {c.status === "Active" && current && !myPayment && now > start + 5 && account && (
            <Button variant="secondary" loading={busy === "pay"} onClick={() => act("pay", () => run(account, payNowCall(circle, account.address)))}>
              Pay now
            </Button>
          )}
          {withdrawable > 0n && (
            <Button
              loading={busy === "claim"}
              onClick={() =>
                act("claim", async () => {
                  const acct = await confirm(); // withdrawals always ask for Face ID
                  await run(acct, claimCall(circle));
                })
              }
            >
              Withdraw {fmt(withdrawable, currency, rates)}
            </Button>
          )}
        </Card>
      )}

      {/* Live auction */}
      {biddingOpen && me && !me.hasWon && me.status === "Active" && (
        <Card className="flex flex-col gap-4 border-accent">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold">Want the pot this round?</h2>
            <span className="num text-sm font-bold text-warn">{countdown(bidEnds - now)}</span>
          </div>
          <p className="text-sm text-muted">
            {current?.bestBidBps != null
              ? `Best offer so far: ${(current.bestBidBps / 100).toFixed(1)}% from ${names.person(current.bestBidder_id!)}.`
              : "No offers yet. If nobody offers, the member with the best savings record receives it."}
          </p>
          <input
            type="range"
            min={0}
            max={c.maxDiscountBps}
            step={50}
            value={bid}
            onChange={(e) => setBid(Number(e.target.value))}
            aria-label="Discount you offer"
            className="accent-[var(--primary)]"
          />
          <p className="text-sm">
            Offer <b>{(bid / 100).toFixed(1)}%</b>: you'd receive <b className="text-primary">{fmt(pot - discount, currency, rates)}</b> now.{" "}
            {fmt((discount * 8n) / 10n, currency, rates)} is shared with the others as savings.
          </p>
          <Button
            loading={busy === "bid"}
            onClick={() =>
              act("bid", async () => {
                // Small offers use the open session; larger ones ask for Face ID.
                const acct = bid > 1000 || !account ? await confirm() : account;
                await run(acct, bidCall(circle, bid));
              })
            }
          >
            Offer {(bid / 100).toFixed(1)}%
          </Button>
        </Card>
      )}

      {err && <Notice tone="bad">{err}</Notice>}

      {/* Invite (creator, while forming): rebuilt from the passkey's invite namespace */}
      {c.status === "Forming" && isCreator && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-extrabold">Invite people</h2>
          {invite ? (
            <ShareInvite link={invite} circleName={title} amount={fmt(c.contribution, currency, rates)} />
          ) : (
            <Button
              variant="secondary"
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
        <Card>
          <h2 className="mb-3 font-extrabold">Who receives when</h2>
          <ol className="flex flex-col gap-2">
            {Array.from({ length: c.totalRounds }, (_, i) => i + 1).map((n) => {
              const r = rounds.find((x) => x.number === n && !x.settlement);
              const who = r?.winner_id;
              return (
                <li key={n} className="flex items-center gap-3 text-sm">
                  <span className={`num flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${r?.status === "PaidOut" ? "bg-primary text-primary-ink" : "bg-surface-2 text-muted"}`}>
                    {n}
                  </span>
                  <span className="flex-1">{who ? names.person(who) : n === c.currentRound ? "This round" : "Upcoming"}</span>
                  <span className="num text-muted">
                    {r?.status === "PaidOut" ? fmt(BigInt(r.pot ?? "0") - (BigInt(r.pot ?? "0") * BigInt(r.discountBps ?? 0)) / 10_000n, currency, rates) : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {/* Members */}
      <Card>
        <h2 className="mb-3 font-extrabold">People</h2>
        <ul className="flex flex-col gap-3">
          {seats.map((s) => {
            const paid = d.data?.Payment.find((p) => p.round_id === current?.id && p.member_id === s.member_id);
            return (
              <li key={s.id} className="flex items-center gap-3">
                <Avatar seed={s.member_id} name={names.personName(s.member_id)} />
                <div className="flex-1">
                  <MemberName address={s.member_id} />
                  <p className="text-xs text-muted">
                    {s.displayCurrency} · {s.paymentsOnTime} on time{s.defaults ? ` · ${s.defaults} missed` : ""}
                    {s.hasWon ? ` · received in round ${s.wonRound}` : ""}
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

      <p className="px-2 text-center text-xs text-muted">
        {fmt(c.contribution, currency, rates)} every {duration(c.period)} · safety fund {fmt(c.reserveBalance, currency, rates)} · health {c.healthScore}/100
      </p>

      {myReceived && <Feedback circle={circle} />}
    </Screen>
  );
}

function MemberName({ address }: { address: string }) {
  const names = useNames();
  const [editing, setEditing] = useState(false);
  const stored = names.personName(address) ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? stored;
  const setValue = setDraft;
  const label = names.person(address);
  if (!names.unlocked || label === "You") return <p className="font-semibold">{label}</p>;
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
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1 text-sm" placeholder="e.g. Mom" />
        <button className="text-sm font-bold text-primary">Save</button>
      </form>
    );
  return (
    <button className="text-left font-semibold" onClick={() => setEditing(true)}>
      {label} <span className="text-xs font-medium text-primary">✎</span>
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
