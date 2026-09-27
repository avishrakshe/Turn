"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { useDate, useMoney, useStore } from "@/lib/app/hooks";
import { roundDate } from "@/lib/app/selectors";
import { type CircleRec, store } from "@/lib/app/store";
import { useT } from "@/lib/i18n";
import type { DisplayCurrency } from "@/lib/money";
import { useApp } from "./AppProvider";
import { LanguagePicker } from "./LanguagePicker";

const CURRENCIES: DisplayCurrency[] = ["INR", "AED", "GBP", "USD"];

export function SettingsScreen() {
  const t = useT();
  const router = useRouter();
  const { passkey } = useApp();
  const { fmt } = useMoney();
  const date = useDate();
  const profile = useStore((s) => s.profile);
  const prefs = useStore((s) => s.prefs);
  const telegram = useStore((s) => s.telegram);
  const circles = useStore((s) => s.circles);
  const order = useStore((s) => s.order);
  const [revoking, setRevoking] = useState<CircleRec | null>(null);
  const [recovery, setRecovery] = useState(false);
  const running = order.map((id) => circles[id]!).filter((c) => c?.engine && c.engine.status !== "COMPLETED");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{t("settings.title")}</h1>

      <Section title={t("settings.name")}>
        <input
          aria-label={t("settings.name")}
          defaultValue={profile?.name}
          onBlur={(e) => e.target.value.trim() && store.setName(e.target.value.trim())}
          className="border-line-strong bg-paper-raised min-h-12 w-full rounded-xl border px-4"
          maxLength={30}
        />
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

      <Section title={t("settings.telegram")} hint={t("settings.telegramBody")}>
        <div className="flex items-center justify-between gap-3">
          {telegram ? <Badge tone="success" dot>{t("settings.telegramOn")}</Badge> : <span />}
          <Button variant={telegram ? "ghost" : "secondary"} onClick={() => store.setTelegram(!telegram)}>
            {telegram ? t("settings.revoke") : t("settings.telegramConnect")}
          </Button>
        </div>
        {telegram && <p className="text-ink-muted mt-2 text-xs">{t("settings.telegramDemo")}</p>}
      </Section>

      <Section title={t("settings.sessions")} hint={t("settings.sessionsBody")}>
        <ul className="divide-line flex flex-col divide-y">
          {running.map((c) => {
            const until = roundDate(c, c.n);
            return (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{t("settings.autopayItem", { circle: c.name })}</p>
                  <p className="text-ink-muted text-sm">
                    {t("settings.autopayScope", { amount: fmt(c.contribution), period: t(`settings.period.${c.frequency}`), until: date(until, true) })}
                  </p>
                </div>
                {c.autopay ? (
                  <Button variant="outline" onClick={() => setRevoking(c)}>
                    {t("settings.revoke")}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (await passkey(t("settings.autopayItem", { circle: c.name }))) store.setAutopay(c.id, true);
                    }}
                  >
                    {t("settings.turnOn")}
                  </Button>
                )}
              </li>
            );
          })}
          <li className="py-3">
            <p className="font-semibold">{t("settings.deviceSession")}</p>
            <p className="text-ink-muted text-sm">{t("settings.deviceScope")}</p>
          </li>
        </ul>
      </Section>

      <Section title={t("settings.recovery")} hint={t("settings.recoveryBody")}>
        <Button
          variant="outline"
          onClick={async () => {
            if (await passkey(t("settings.recoveryShow"))) setRecovery(true);
          }}
        >
          {t("settings.recoveryShow")}
        </Button>
        {recovery && <p className="bg-paper-sunk mt-3 rounded-xl p-4 text-sm">{t("settings.recoveryDemo")}</p>}
      </Section>

      <Button
        variant="ghost"
        className="text-danger self-start"
        onClick={() => {
          if (window.confirm(t("demo.resetConfirm"))) {
            store.reset();
            router.push("/app");
          }
        }}
      >
        {t("settings.reset")}
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
              onClick={async () => {
                const c = revoking;
                setRevoking(null);
                if (c && (await passkey(t("settings.revokeTitle")))) store.setAutopay(c.id, false);
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
