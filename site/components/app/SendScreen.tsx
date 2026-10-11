"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useMoney } from "@/lib/app/hooks";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { run, sendCall } from "@/lib/live/actions";
import { passkeyErrorKind } from "@/lib/live/capability";
import { isTestnet, txUrl } from "@/lib/live/config";
import { circleDetail } from "@/lib/live/indexer";
import { useBalance, useMyCircles } from "@/lib/live/hooks";
import { shortAddr } from "@/lib/live/money";
import { useNames } from "@/lib/live/names";
import { useSession } from "@/lib/live/session";
import { formatMoneyParts } from "@/lib/money";
import { useApp } from "./AppProvider";

const ausd = (units: bigint) => (Number(units) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * Send money to someone in one of your circles: pick them, type an amount in your own currency, confirm with Face ID.
 * It moves AUSD from your account to theirs in one sponsored transaction (no MON), and links to it on the explorer.
 */
export function SendScreen() {
  const t = useT();
  const qc = useQueryClient();
  const { receipt } = useApp();
  const { fmt, units, currency } = useMoney();
  const { address, confirm } = useSession();
  const names = useNames();
  const my = useMyCircles();
  const balance = useBalance();
  const [to, setTo] = useState<Address | null>(null);
  const [manual, setManual] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ txHash: string; to: Address; units: bigint } | null>(null);

  // Everyone you share a circle with, once each, with the circles you share.
  const circleIds = useMemo(() => (my.data?.Membership ?? []).map((m) => m.circle.id), [my.data]);
  const people = useQuery({
    queryKey: ["send-people", circleIds.join(",")],
    enabled: circleIds.length > 0,
    queryFn: async () => {
      const details = await Promise.all(circleIds.map((c) => circleDetail(c)));
      const out = new Map<string, { address: Address; circles: string[] }>();
      details.forEach((d, i) => {
        for (const m of d.Membership) {
          if (m.member_id.toLowerCase() === address?.toLowerCase()) continue;
          const a = getAddress(m.member_id);
          const p = out.get(a) ?? { address: a, circles: [] };
          p.circles.push(circleIds[i]!);
          out.set(a, p);
        }
      });
      return [...out.values()];
    },
  });

  const value = Number(amount.replace(/[^0-9.]/g, "")) || 0;
  const sendUnits = value > 0 ? units(value) : 0n;
  const recipient = to ?? (isAddress(manual.trim()) ? getAddress(manual.trim()) : null);
  const tooMuch = balance.data !== undefined && sendUnits > balance.data;
  const symbol = formatMoneyParts(0, currency).find((p) => p.type === "currency")?.value ?? currency;
  const label = (a: Address) => names.person(a, t("common.you"));

  async function send() {
    if (!recipient || sendUnits === 0n) return;
    setBusy(true);
    setErr(null);
    try {
      // Moving money always asks for Face ID (unless you confirmed moments ago).
      const acct = await confirm();
      const { txHash } = await run(acct, sendCall(recipient, sendUnits));
      receipt(t("send.sent", { amount: fmt(sendUnits), name: label(recipient) }), txHash);
      setDone({ txHash, to: recipient, units: sendUnits });
      await qc.invalidateQueries();
    } catch (e) {
      const kind = passkeyErrorKind(e);
      setErr(kind === "cancelled" ? t("live.cancelled") : (e as Error).message || t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl">{t("send.doneTitle")}</h1>
        <Card className="flex flex-col gap-3" data-testid="send-done">
          <p className="font-display tabular text-4xl">{fmt(done.units)}</p>
          <p className="text-ink-muted tabular text-sm">{t("live.ausdBalance", { amount: ausd(done.units) })}</p>
          <p>{t("send.doneBody", { name: label(done.to) })}</p>
          <a href={txUrl(done.txHash)} target="_blank" rel="noopener noreferrer" className="text-teal-ink font-semibold underline-offset-4 hover:underline" data-testid="send-tx">
            {t("send.viewTx")}
          </a>
          <p className="text-ink-muted font-mono text-xs break-all">{done.txHash}</p>
        </Card>
        <Button variant="outline" onClick={() => (setDone(null), setAmount(""), setTo(null), setManual(""))}>
          {t("send.another")}
        </Button>
        <Link href="/app" className="text-teal-ink min-h-11 font-semibold underline-offset-4 hover:underline">
          {t("nav.home")}
        </Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">{t("send.title")}</h1>
        <p className="text-ink-muted mt-1">{t("send.lead")}</p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-sans text-sm font-semibold tracking-normal">{t("send.who")}</h2>
        {people.data && people.data.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="send-people">
            {people.data.map((p) => (
              <li key={p.address}>
                <button
                  type="button"
                  aria-pressed={to === p.address}
                  onClick={() => (setTo(p.address), setManual(""))}
                  className={cn(
                    "bg-paper-raised border-line flex w-full items-center justify-between gap-3 rounded-card border p-4 text-start",
                    to === p.address && "border-marigold ring-marigold-soft ring-4",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{label(p.address)}</span>
                    <span className="text-ink-muted block truncate text-xs">
                      {p.circles.map((c) => names.circle(c, t("live.aCircle"))).join(" · ")}
                    </span>
                  </span>
                  <span className="text-ink-muted shrink-0 font-mono text-xs">{shortAddr(p.address)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : my.data && circleIds.length === 0 ? (
          <Card tone="sunk">
            <EmptyState title={t("send.noPeople")} />
          </Card>
        ) : null}
        <details className="mt-1">
          <summary className="text-teal-ink min-h-11 cursor-pointer py-2 text-sm font-semibold">{t("send.toAddress")}</summary>
          <input
            value={manual}
            onChange={(e) => (setManual(e.target.value), setTo(null))}
            placeholder="0x…"
            aria-label={t("send.toAddress")}
            className="border-line-strong bg-paper-raised min-h-12 w-full rounded-xl border px-4 font-mono text-sm"
          />
        </details>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="send-amount" className="text-sm font-semibold">
          {t("send.amount", { currency })}
        </label>
        <div className="border-line-strong bg-paper-raised focus-within:border-teal flex min-h-16 items-center gap-2 rounded-2xl border px-5">
          <span aria-hidden className="text-ink-muted text-2xl">
            {symbol}
          </span>
          <input
            id="send-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="tabular font-display min-w-0 flex-1 bg-transparent text-3xl outline-none"
          />
        </div>
        <p className="text-ink-muted tabular text-sm">
          {sendUnits > 0n ? t("send.equals", { amount: ausd(sendUnits) }) : null}
          {balance.data !== undefined && ` ${t("send.available", { amount: fmt(balance.data) })}`}
        </p>
        {tooMuch && <p className="text-danger text-sm">{t("send.tooMuch")}</p>}
        {isTestnet && <p className="text-ink-muted text-xs">{t("send.testnet")}</p>}
      </section>

      {err && (
        <p role="alert" className="text-danger text-sm">
          {err}
        </p>
      )}
      <Button size="lg" busy={busy} disabled={!recipient || sendUnits === 0n || tooMuch} onClick={send} data-testid="send">
        {recipient && sendUnits > 0n ? t("send.confirm", { amount: fmt(sendUnits), name: label(recipient) }) : t("send.cta")}
      </Button>
      <p className="text-ink-muted text-center text-xs">{t("live.noFees")}</p>
    </div>
  );
}
