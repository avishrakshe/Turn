"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Stepper } from "@/components/ui/Stepper";
import { useMoney, useStore } from "@/lib/app/hooks";
import { niceAmount } from "@/lib/app/money";
import { store } from "@/lib/app/store";
import { type Frequency, MAX_MEMBERS, MIN_MEMBERS, TEMPLATES, type TemplateId } from "@/lib/app/templates";
import { cn } from "@/lib/cn";
import type { Mode } from "@/lib/economics/engine";
import { useMessages, useT } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { useApp } from "./AppProvider";

export function CreateFlow() {
  const t = useT();
  const m = useMessages();
  const router = useRouter();
  const { passkey, receipt } = useApp();
  const { currency, rates, units, fmt } = useMoney();
  const profile = useStore((s) => s.profile);

  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<TemplateId | null>(null);
  const [amount, setAmount] = useState(0);
  const [members, setMembers] = useState(5);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [mode, setMode] = useState<Mode>("FIXED_ORDER");
  const [name, setName] = useState("");
  const [yourName, setYourName] = useState(profile?.name ?? "");
  const [busy, setBusy] = useState(false);

  const money = (x: number) => formatMoney(x, currency);
  const periodWord = t(`create.frequencyWord.${frequency}`);
  const duration = t(frequency === "monthly" ? "common.months" : "common.weeks", { count: members });
  const canNext = step === 0 ? template !== null : step === 1 ? amount > 0 : step === 2 ? true : name.trim() !== "" && yourName.trim() !== "";

  function pick(id: TemplateId) {
    const tpl = TEMPLATES.find((x) => x.id === id)!;
    setTemplate(id);
    setAmount(niceAmount(tpl.usd, currency, rates));
    setMembers(tpl.members);
    setFrequency(tpl.frequency);
    setMode(tpl.mode);
    setName(id === "custom" ? "" : t(`create.templates.${id}.name`));
    store.tap();
    setStep(1);
  }

  async function create() {
    store.tap();
    const contribution = units(amount);
    const ok = await passkey(t("create.passkeySummary", { name: name.trim(), amount: fmt(contribution) }));
    if (!ok) return;
    setBusy(true);
    // Optimistic: Monad confirms in about a second; the demo mirrors that.
    await new Promise((r) => setTimeout(r, 600));
    const id = store.createCircle({ name, template: template ?? "custom", contribution, n: members, frequency, mode, yourName });
    receipt(name.trim(), t("create.reviewLines.deposit", { amount: fmt(contribution) }));
    router.push(`/app/circle/${id}`);
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
            <input
              id="amount"
              inputMode="decimal"
              value={amount === 0 ? "" : String(amount)}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0))}
              className="tabular border-line-strong bg-paper-raised font-display min-h-16 rounded-2xl border px-5 text-3xl"
            />
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
          {!profile && (
            <div className="flex flex-col gap-2">
              <label htmlFor="your-name" className="text-sm font-semibold">
                {t("create.yourName")}
              </label>
              <input
                id="your-name"
                value={yourName}
                onChange={(e) => setYourName(e.target.value)}
                placeholder={t("create.yourNamePlaceholder")}
                autoComplete="given-name"
                className="border-line-strong bg-paper-raised min-h-12 rounded-xl border px-4"
                maxLength={30}
              />
            </div>
          )}
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
        </div>
      )}

      {step > 0 && (
        <div className={cn("bg-paper/95 sticky -mx-4 px-4 py-3", profile ? "bottom-16 sm:bottom-0" : "bottom-0")}>
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
