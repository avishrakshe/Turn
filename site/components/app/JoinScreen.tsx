"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TurnRing } from "@/components/ring/TurnRing";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDate, useMoney, useStore } from "@/lib/app/hooks";
import { decodeInvite } from "@/lib/app/invite";
import { store } from "@/lib/app/store";
import { useT } from "@/lib/i18n";
import { useApp } from "./AppProvider";

export function JoinScreen({ code }: { code: string }) {
  const t = useT();
  const router = useRouter();
  const { passkey, receipt } = useApp();
  const { fmt } = useMoney();
  const date = useDate();
  const profile = useStore((s) => s.profile);
  const circles = useStore((s) => s.circles);
  const invite = useMemo(() => decodeInvite(code), [code]);
  const [name, setName] = useState(profile?.name ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => store.markOpened(), []);

  if (!invite) return <EmptyState title={t("join.invalid")} action={<Link href="/app" className="text-teal-ink min-h-11 font-semibold underline">{t("nav.home")}</Link>} />;
  if (circles[invite.id]) {
    return (
      <EmptyState
        title={t("join.already")}
        action={
          <Link href={`/app/circle/${invite.id}`} className="text-teal-ink min-h-11 font-semibold underline">
            {invite.name}
          </Link>
        }
      />
    );
  }
  if (invite.joined.length >= invite.n) return <EmptyState title={t("join.full")} />;

  const contribution = BigInt(invite.contribution);
  const frequency = t(`create.frequencyWord.${invite.frequency}`);
  const duration = t(invite.frequency === "monthly" ? "common.months" : "common.weeks", { count: invite.n });
  const end = new Date();
  if (invite.frequency === "weekly") end.setDate(end.getDate() + 7 * invite.n);
  else end.setMonth(end.getMonth() + invite.n);
  const seats = [...invite.joined.map((n) => ({ name: n })), { name: name.trim() || t("common.you") }];

  async function join() {
    store.tap();
    const ok = await passkey(t("join.passkeySummary", { name: invite!.name, amount: fmt(contribution) }));
    if (!ok) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));
    const id = store.joinFromInvite(invite!, name);
    receipt(t("join.joined"), t("join.whatNext", { amount: fmt(contribution) }));
    router.push(`/app/circle/${id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <p className="text-ink-muted">{t("join.invitedBy", { organiser: invite.organiser })}</p>
        <h1 className="mt-1 text-4xl">{invite.name}</h1>
      </div>

      <div className="mx-auto w-full max-w-72">
        <TurnRing
          members={seats}
          step={seats.length - 1}
          label={t("join.seats", { joined: invite.joined.length, total: invite.n })}
          center={<span className="text-ink-muted text-sm font-semibold">{t("join.seats", { joined: invite.joined.length, total: invite.n })}</span>}
        />
      </div>

      <Card className="flex flex-col gap-1 text-center">
        <p className="text-lg font-semibold">
          {t("join.summary", { people: t("common.people", { count: invite.n }), amount: fmt(contribution), frequency, duration })}
        </p>
        <p className="text-ink-muted">{t("join.receive", { pot: fmt(contribution * BigInt(invite.n)) })}</p>
      </Card>

      <Card tone="sunk" className="flex gap-3">
        <svg viewBox="0 0 24 24" className="text-success mt-0.5 size-6 shrink-0" aria-hidden>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div>
          <p className="font-semibold">{t("join.autopayTitle")}</p>
          <p className="text-ink-muted mt-1 text-sm">{t("join.autopayBody", { amount: fmt(contribution), frequency, until: date(end, true) })}</p>
        </div>
      </Card>

      {!profile && (
        <div className="flex flex-col gap-2">
          <label htmlFor="join-name" className="text-sm font-semibold">
            {t("join.yourName")}
          </label>
          <input
            id="join-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("create.yourNamePlaceholder")}
            autoComplete="given-name"
            maxLength={30}
            className="border-line-strong bg-paper-raised min-h-12 rounded-xl border px-4"
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-ink-muted text-sm">{t("join.whatNext", { amount: fmt(contribution) })}</p>
        <Button size="lg" onClick={join} busy={busy} disabled={!profile && name.trim() === ""}>
          {t("join.confirm")}
        </Button>
      </div>
    </div>
  );
}
