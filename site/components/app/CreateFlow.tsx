"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Stepper } from "@/components/ui/Stepper";
import { useFrequencyText, useMoney } from "@/lib/app/hooks";
import { niceAmount } from "@/lib/app/money";
import { type Frequency, MAX_MEMBERS, MIN_MEMBERS, PERIOD_SECONDS, TEMPLATES, type TemplateId } from "@/lib/app/templates";
import { cn } from "@/lib/cn";
import type { Mode } from "@/lib/economics/engine";
import { useMessages, useT } from "@/lib/i18n";
import { createCircleCalls, run } from "@/lib/live/actions";
import { passkeyErrorKind } from "@/lib/live/capability";
import { predictCircle } from "@/lib/live/chain";
import { config, isTestnet } from "@/lib/live/config";
import { topUpFor } from "@/lib/live/funds";
import { setFlow, tap } from "@/lib/live/metrics";
import { useNames } from "@/lib/live/names";
import { inviteSecret } from "@/lib/live/passkey";
import { useSession } from "@/lib/live/session";
import { currencyLocale, formatMoney, formatMoneyParts } from "@/lib/money";
import { useApp } from "./AppProvider";

/** Factory limit per contribution: 25 AUSD during the mainnet beta, 1,000 test AUSD on testnet. */
const CAP = config.chainId === 143 ? 25n * 10n ** 6n : 1_000n * 10n ** 6n;

export function CreateFlow() {
  const t = useT();
  const m = useMessages();
  const router = useRouter();
  const { receipt } = useApp();
  const { currency, rates, units, fmt } = useMoney();
  const freq = useFrequencyText();
  const { confirm, unlock } = useSession();
  const names = useNames();

  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<TemplateId | null>(null);
  const [amount, setAmount] = useState(0);
  const [members, setMembers] = useState(5);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [mode, setMode] = useState<Mode>("FIXED_ORDER");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const money = (x: number) => formatMoney(x, currency);
  const symbol = formatMoneyParts(0, currency).find((p) => p.type === "currency")?.value ?? currency;
  const grouped = (x: number) => new Intl.NumberFormat(currencyLocale[currency]).format(x);
  const periodWord = freq.word(frequency);
  const duration = freq.duration(frequency, members);
  const tooBig = amount > 0 && units(amount) > CAP;
  const canNext = step === 0 ? template !== null : step === 1 ? amount > 0 && !tooBig : step === 2 ? true : name.trim() !== "";

  function pick(id: TemplateId) {
    const tpl = TEMPLATES.find((x) => x.id === id)!;
    setTemplate(id);
    setAmount(niceAmount(tpl.usd, currency, rates));
    setMembers(tpl.members);
    setFrequency(tpl.frequency);
    setMode(tpl.mode);
    setName(id === "custom" ? "" : t(`create.templates.${id}.name`));
    tap();
    setStep(1);
  }

  // One signed batch, sponsored by the relayer: approve the deposit, create the circle, grant auto-pay. Starting a
  // circle moves money, so it asks for Face ID (no second prompt if you created your account moments ago).
  async function create() {
    tap();
    setFlow("create");
    setBusy(true);
    setErr(null);
    try {
      const contribution = units(amount);
      const account = await confirm();
      const predicted = await predictCircle(account.address);
      // Invite secret from the passkey's invite key: rebuilt on any device, never stored.
      const secret = await inviteSecret(await unlock("invite"), predicted);
      const calls = createCircleCalls(
        account.address,
        predicted,
        { size: members, contribution, period: PERIOD_SECONDS[frequency], auction: mode === "AUCTION", currency },
        secret,
      );
      calls.unshift(...(await topUpFor(account.address, contribution)));
      const { txHash } = await run(account, calls);
      names.remember(predicted, name.trim());
      receipt(name.trim(), txHash, t("create.reviewLines.deposit", { amount: fmt(contribution) }));
      router.push(`/app/circle/${predicted}?created=1`);
    } catch (e) {
      const kind = passkeyErrorKind(e);
      setErr(kind === "cancelled" ? t("live.cancelled") : kind === "unsupported" ? t("live.noPrf") : (e as Error).message || t("errors.generic"));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} className="-ms-3" aria-label={t("common.back")}>
            <svg viewBox="0 0 20 20" className="size-5 rtl:-scale-x-100" aria-hidden>
              <path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        )}
        <h1 className="text-3xl">{t("create.title")}</h1>
      </div>
      <Stepper
        steps={[...m.create.steps]}
        current={step}
        label={t("create.title")}
        stepOf={t("create.stepOf", { current: step + 1, total: m.create.steps.length })}
        doneLabel={t("create.stepDone")}
      />

      {step === 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="font-display mb-3 text-2xl">{t("create.templateTitle")}</legend>
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => pick(tpl.id)}
              className={cn(
                "bg-paper-raised border-line hover:border-line-strong flex items-start gap-4 rounded-card border p-4 text-start transition-colors",
                template === tpl.id && "border-marigold ring-marigold-soft ring-4",
              )}
            >
              <span className="bg-teal-soft text-teal-ink grid size-11 shrink-0 place-items-center rounded-xl">
                <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
                  <path d={tpl.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </span>
              <span>
                <span className="block font-semibold">{t(`create.templates.${tpl.id}.name`)}</span>
                <span className="text-ink-muted mt-0.5 block text-sm">{t(`create.templates.${tpl.id}.blurb`)}</span>
              </span>
            </button>
          ))}
        </fieldset>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-6">
          <h2 className="text-2xl">{t("create.amountTitle")}</h2>
          <div className="flex flex-col gap-2">
            <label htmlFor="amount" className="text-sm font-semibold">
              {t("create.amountLabel")} ({currency})
            </label>
            <div className="border-line-strong bg-paper-raised focus-within:border-teal focus-within:ring-teal-soft flex min-h-16 items-center gap-2 rounded-2xl border px-5 transition-[border-color,box-shadow] focus-within:ring-4">
              <span aria-hidden className="text-ink-muted text-2xl font-medium">
                {symbol}
              </span>
              <input
                id="amount"
                inputMode="numeric"
                autoComplete="off"
                // Grouped as the person reads money (₹1,00,000 for rupees); only digits are kept.
                value={amount === 0 ? "" : grouped(amount)}
                onChange={(e) => setAmount(Math.min(10_000_000, Number(e.target.value.replace(/\D/g, "")) || 0))}
                className="tabular font-display min-w-0 flex-1 bg-transparent text-3xl outline-none"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span id="members-label" className="text-sm font-semibold">
              {t("create.membersLabel")}
            </span>
            <div className="flex items-center gap-4" role="group" aria-labelledby="members-label">
              <Button variant="outline" onClick={() => setMembers((n) => Math.max(MIN_MEMBERS, n - 1))} disabled={members <= MIN_MEMBERS} aria-label={t("create.fewer")}>
                −
              </Button>
              <output aria-live="polite" className="tabular font-display w-12 text-center text-3xl">
                {members}
              </output>
              <Button variant="outline" onClick={() => setMembers((n) => Math.min(MAX_MEMBERS, n + 1))} disabled={members >= MAX_MEMBERS} aria-label={t("create.more")}>
                +
              </Button>
            </div>
            <p className="text-ink-muted text-sm">{t("create.membersHint")}</p>
            {tooBig && (
              <p role="alert" className="text-danger text-sm">
                {t("live.overCap", { amount: fmt(CAP) })}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{t("create.frequency")}</span>
            <SegmentedControl
              label={t("create.frequency")}
              value={frequency}
              onChange={setFrequency}
              options={[
                { value: "monthly", label: t("create.monthly") },
                { value: "weekly", label: t("create.weekly") },
                { value: "fast", label: t("live.fast") },
              ]}
              className="flex w-full"
            />
          </div>
          <Card tone="sunk" className="text-ink-muted">
            {t("create.summary", { pot: money(amount * members), duration })}
          </Card>
        </div>
      )}

      {step === 2 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="font-display mb-3 text-2xl">{t("create.turnsTitle")}</legend>
          {(
            [
              ["FIXED_ORDER", "order"],
              ["AUCTION", "bid"],
            ] as const
          ).map(([value, key]) => (
            <label
              key={value}
              className={cn(
                "bg-paper-raised border-line flex cursor-pointer items-start gap-4 rounded-card border p-4",
                mode === value && "border-marigold ring-marigold-soft ring-4",
              )}
            >
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="accent-teal mt-1 size-5" />
              <span>
                <span className="block font-semibold">{t(`create.${key}`)}</span>
                <span className="text-ink-muted mt-0.5 block text-sm">{t(`create.${key}Blurb`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-5">
          <h2 className="text-2xl">{t("create.reviewTitle")}</h2>
          <div className="flex flex-col gap-2">
            <label htmlFor="circle-name" className="text-sm font-semibold">
              {t("create.circleName")}
            </label>
            <input id="circle-name" value={name} onChange={(e) => setName(e.target.value)} className="border-line-strong bg-paper-raised min-h-12 rounded-xl border px-4" maxLength={40} />
          </div>
          <Card>
            <ul className="flex flex-col gap-3">
              {[
                t("create.reviewLines.people", { count: members }),
                t("create.reviewLines.pay", { amount: money(amount), frequency: periodWord }),
                t("create.reviewLines.receive", { pot: money(amount * members) }),
                t(`create.reviewLines.mode.${mode === "AUCTION" ? "bid" : "order"}`),
                t("create.reviewLines.deposit", { amount: money(amount) }),
                t("create.reviewLines.autopay", { amount: money(amount), frequency: periodWord }),
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <svg viewBox="0 0 16 16" className="text-teal mt-1 size-4 shrink-0" aria-hidden>
                    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {line}
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-ink-muted text-sm">{t("create.whatNext")}</p>
          {isTestnet && <p className="text-ink-muted text-xs">{t("live.testMoneyDeposit")}</p>}
          {err && (
            <p role="alert" className="text-danger text-sm">
              {err}
            </p>
          )}
        </div>
      )}

      {step > 0 && (
        // Sits just above the tab bar (and the phone's home indicator), fading the content under it.
        <div
          className={cn(
            "from-paper via-paper sticky -mx-4 bg-gradient-to-t via-70% to-transparent px-4 pt-6 pb-3",
            "bottom-[calc(4.4rem+env(safe-area-inset-bottom))] sm:bottom-0",
          )}
        >
          {step < 3 ? (
            <Button size="lg" className="w-full" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              {t("common.next")}
            </Button>
          ) : (
            <Button size="lg" className="w-full" onClick={create} disabled={!canNext} busy={busy}>
              {t("create.confirm")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
