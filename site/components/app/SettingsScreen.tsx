"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Address } from "viem";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useDate, useFrequencyText, useMoney, useStore } from "@/lib/app/hooks";
import { store } from "@/lib/app/store";
import { frequencyOf } from "@/lib/app/templates";
import { useT } from "@/lib/i18n";
import { renewCall, revokeCall, run } from "@/lib/live/actions";
import { addressUrl } from "@/lib/live/config";
import { useGrants, useMyCircles, useNow } from "@/lib/live/hooks";
import { shortAddr } from "@/lib/live/money";
import { useNames } from "@/lib/live/names";
import { SESSION_MINUTES, useSession } from "@/lib/live/session";
import type { DisplayCurrency } from "@/lib/money";
import { promptInstall, useInstall } from "@/lib/pwa";
import { useApp } from "./AppProvider";
import { circleFallbackName } from "./CircleCard";
import { LanguagePicker } from "./LanguagePicker";

const CURRENCIES: DisplayCurrency[] = ["INR", "AED", "GBP", "USD"];

export function SettingsScreen() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { receipt } = useApp();
  const { fmt } = useMoney();
  const freq = useFrequencyText();
  const date = useDate();
  const prefs = useStore((s) => s.prefs);
  const session = useSession();
  const names = useNames();
  const my = useMyCircles();
  const grants = useGrants();
  const now = useNow(30_000);
  const install = useInstall();
  const [revoking, setRevoking] = useState<{ circle: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const address = session.address as Address;
  const seats = (my.data?.Membership ?? []).filter((m) => m.status === "Active" && m.circle.status !== "Completed");

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
      <h1 className="text-3xl">{t("settings.title")}</h1>

      <Section title={t("live.account")} hint={t("live.accountHint")}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success" dot>
            {t("live.passkeyBadge")}
          </Badge>
          <button
            type="button"
            className="tabular font-mono text-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address);
                toast({ tone: "success", title: t("live.addressCopied") });
              } catch {
                toast({ title: address });
              }
            }}
          >
            {shortAddr(address)}
          </button>
          <a href={addressUrl(address)} target="_blank" rel="noopener noreferrer" className="text-teal-ink text-sm font-semibold underline-offset-4 hover:underline">
            {t("live.viewOnExplorer")}
          </a>
        </div>
      </Section>

      <Section title={t("settings.name")} hint={t("live.yourNameHint")}>
        <input
          key={names.me ?? ""}
          aria-label={t("settings.name")}
          defaultValue={names.me}
          disabled={!names.ready}
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== names.me && void names.setMe(e.target.value.trim())}
          className="border-line-strong bg-paper-raised min-h-12 w-full rounded-xl border px-4 disabled:opacity-60"
          maxLength={30}
        />
        {!names.ready && <p className="text-ink-muted text-xs">{t("live.namesLocked")}</p>}
      </Section>

      <Section title={t("settings.language")}>
        <LanguagePicker />
      </Section>

      <Section title={t("settings.currency")} hint={t("settings.currencyHint")}>
        <SegmentedControl
          label={t("settings.currency")}
          value={prefs.currency}
          onChange={(c) => store.setPrefs({ currency: c })}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          className="flex w-full"
        />
      </Section>

      {install.ready && !install.standalone && (
        <Section title={t("install.settingsTitle")} hint={t("install.settingsHint")}>
          {install.canPrompt ? (
            <Button variant="secondary" className="self-start" onClick={() => promptInstall()}>
              {t("install.install")}
            </Button>
          ) : (
            <ButtonLink href="/app/get" variant="secondary" className="self-start">
              {t("install.cardTitle")}
            </ButtonLink>
          )}
        </Section>
      )}

      <div id="autopay" className="scroll-mt-24">
        <Section title={t("settings.sessions")} hint={t("settings.sessionsBody")}>
          <ul className="divide-line flex flex-col divide-y">
            {(grants.data?.Session ?? []).map((g) => {
              const seat = seats.find((s) => s.circle.id.toLowerCase() === g.circle_id.toLowerCase());
              const name = seat ? names.circle(seat.circle.id, circleFallbackName(t, seat.circle)) : names.circle(g.circle_id, t("live.aCircle"));
              const expired = Number(g.validUntil) < now;
              const on = g.active && !expired;
              const f = seat ? frequencyOf(seat.circle.period) : "monthly";
              return (
                <li key={g.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{t("settings.autopayItem", { circle: name })}</p>
                    <p className="text-ink-muted text-sm">
                      {on
                        ? t("settings.autopayScope", { amount: fmt(BigInt(g.maxAmount)), period: freq.period(f), until: date(new Date(Number(g.validUntil) * 1000), true) })
                        : expired
                          ? t("live.autopayExpired", { date: date(new Date(Number(g.validUntil) * 1000), true) })
                          : t("settings.revoked")}
                    </p>
                    <p className="text-ink-muted text-xs">{t("live.pulls", { count: g.pulls })}</p>
                  </div>
                  {on && seat ? (
                    <Button variant="outline" busy={busy === g.id} disabled={busy !== null} onClick={() => setRevoking({ circle: g.circle_id, name })}>
                      {t("settings.revoke")}
                    </Button>
                  ) : seat ? (
                    <Button
                      variant="secondary"
                      busy={busy === g.id}
                      disabled={busy !== null}
                      onClick={() =>
                        act(
                          g.id,
                          async () =>
                            run(await session.confirm(), renewCall(address, seat.circle.id as Address, BigInt(seat.circle.contribution), seat.circle.period, seat.circle.size)),
                          t("live.autopayBackOn"),
                        )
                      }
                    >
                      {expired ? t("live.renew") : t("settings.turnOn")}
                    </Button>
                  ) : null}
                </li>
              );
            })}
            {grants.data && grants.data.Session.length === 0 && <li className="text-ink-muted py-3 text-sm">{t("live.noGrants")}</li>}
            <li className="flex items-start justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">{t("settings.deviceSession")}</p>
                <p className="text-ink-muted text-sm">{t("live.deviceScope", { minutes: SESSION_MINUTES })}</p>
                <p className="text-ink-muted text-xs">
                  {session.expiresAt ? t("live.sessionUntil", { time: new Date(session.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }) : t("live.sessionLocked")}
                </p>
              </div>
              {session.account && (
                <Button variant="outline" onClick={session.lock}>
                  {t("live.lockNow")}
                </Button>
              )}
            </li>
          </ul>
          {err && (
            <p role="alert" className="text-danger text-sm">
              {err}
            </p>
          )}
        </Section>
      </div>

      <Section title={t("settings.recovery")} hint={t("settings.recoveryBody")}>
        {phrase ? (
          <>
            <ol className="bg-paper-sunk grid grid-cols-3 gap-1.5 rounded-2xl p-3" data-testid="phrase">
              {phrase.split(" ").map((w, i) => (
                <li key={i} className="flex gap-1 font-mono text-xs">
                  <span className="text-ink-muted">{i + 1}</span>
                  {w}
                </li>
              ))}
            </ol>
            <Button variant="outline" className="self-start" onClick={() => setPhrase(null)}>
              {t("live.hide")}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            className="self-start"
            busy={busy === "phrase"}
            onClick={async () => {
              setBusy("phrase");
              try {
                setPhrase(await session.exportPhrase());
              } catch {
                // Face ID dismissed.
              } finally {
                setBusy(null);
              }
            }}
          >
            {t("settings.recoveryShow")}
          </Button>
        )}
      </Section>

      <Button
        variant="ghost"
        className="self-start"
        onClick={() => {
          session.signOut();
          router.push("/app");
        }}
      >
        {t("live.signOut")}
      </Button>

      <Sheet
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={t("settings.revokeTitle")}
        description={revoking ? t("settings.revokeBody", { circle: revoking.name }) : undefined}
        footer={
          <>
            <Button
              size="lg"
              onClick={() => {
                const r = revoking!;
                setRevoking(null);
                void act(r.circle, async () => run(await session.confirm(), revokeCall(address, r.circle as Address)), t("live.autopayOff"));
              }}
            >
              {t("settings.revokeConfirm")}
            </Button>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              {t("common.cancel")}
            </Button>
          </>
        }
      />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-sans text-base font-semibold tracking-normal">{title}</h2>
        {hint && <p className="text-ink-muted mt-0.5 text-sm">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}
