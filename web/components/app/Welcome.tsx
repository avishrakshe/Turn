"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TurnRing } from "@/components/ring/TurnRing";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useRates, useStore } from "@/lib/app/hooks";
import { codeFromLink, encodeInvite } from "@/lib/app/invite";
import { AUSD_UNIT, FALLBACK_RATES } from "@/lib/app/money";
import { store } from "@/lib/app/store";
import { useT } from "@/lib/i18n";
import type { DisplayCurrency } from "@/lib/money";
import { LanguagePicker } from "./LanguagePicker";

const CURRENCIES: DisplayCurrency[] = ["INR", "AED", "GBP", "USD"];

/** First screen: pick language and currency (pre-filled), then start or join. */
export function Welcome() {
  const t = useT();
  const router = useRouter();
  const prefs = useStore((s) => s.prefs);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState(false);
  useRates(); // warm the exchange rates for the next screen

  useEffect(() => store.markOpened(), []);

  function openSample() {
    store.tap();
    const code = encodeInvite({
      v: 1,
      id: `c_sample_${Math.random().toString(36).slice(2, 8)}`,
      name: "Family Circle",
      organiser: "Meera",
      organiserCurrency: "AED",
      // Meera set AED 220 a month in Dubai; each member sees it in their own currency.
      contribution: String(Math.round((220 / FALLBACK_RATES.AED) * AUSD_UNIT)),
      n: 5,
      frequency: "monthly",
      mode: "AUCTION",
      joined: ["Meera", "Arjun", "Fatima", "Sanjay"],
    });
    router.push(`/app/join/${code}`);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-4 pt-2 text-center">
        <div className="w-40" aria-hidden>
          <TurnRing members={["Meera", "Arjun", "Fatima", "Ravi", "Sanjay"].map((name) => ({ name }))} step={1} />
        </div>
        <h1 className="text-4xl">{t("welcome.title")}</h1>
        <p className="text-ink-muted max-w-sm">{t("welcome.lead")}</p>
      </div>

      <section aria-labelledby="lang-label" className="flex flex-col gap-2">
        <h2 id="lang-label" className="font-sans text-sm font-semibold tracking-normal">
          {t("welcome.language")}
        </h2>
        <LanguagePicker />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-sans text-sm font-semibold tracking-normal">{t("welcome.currency")}</h2>
        <SegmentedControl
          label={t("welcome.currency")}
          value={prefs.currency}
          onChange={(c) => store.setPrefs({ currency: c })}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          className="flex w-full"
        />
      </section>

      <div className="flex flex-col gap-3">
        <ButtonLink href="/app/create" size="lg" onClick={() => store.tap()}>
          {t("welcome.start")}
        </ButtonLink>
        <Button variant="outline" size="lg" onClick={() => setInviteOpen((o) => !o)} aria-expanded={inviteOpen} aria-controls="invite-form">
          {t("welcome.haveInvite")}
        </Button>
        {inviteOpen && (
          <form
            id="invite-form"
            className="bg-paper-sunk flex flex-col gap-3 rounded-2xl p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const code = codeFromLink(link);
              if (!code) return setError(true);
              store.tap();
              router.push(`/app/join/${code}`);
            }}
          >
            <label htmlFor="invite-link" className="text-sm font-semibold">
              {t("welcome.pasteInvite")}
            </label>
            <input
              id="invite-link"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setError(false);
              }}
              aria-invalid={error}
              aria-describedby={error ? "invite-error" : undefined}
              className="border-line-strong bg-paper-raised min-h-12 rounded-xl border px-4"
              placeholder="https://…/app/join/…"
              inputMode="url"
            />
            {error && (
              <p id="invite-error" className="text-danger text-sm">
                {t("welcome.badInvite")}
              </p>
            )}
            <Button type="submit" variant="secondary">
              {t("welcome.open")}
            </Button>
          </form>
        )}
        <div className="border-line mt-2 flex flex-col items-center gap-1 border-t pt-5 text-center">
          <Button variant="ghost" onClick={openSample}>
            {t("welcome.sample")}
          </Button>
          <p className="text-ink-muted text-xs">{t("welcome.sampleNote")}</p>
        </div>
      </div>
    </div>
  );
}
