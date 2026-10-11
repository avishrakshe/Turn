"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TurnRing } from "@/components/ring/TurnRing";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useRates, useStore } from "@/lib/app/hooks";
import { joinPathFromLink } from "@/lib/app/invite";
import { store } from "@/lib/app/store";
import { useT } from "@/lib/i18n";
import { passkeyErrorKind, prfSupport } from "@/lib/live/capability";
import { startRun, tap } from "@/lib/live/metrics";
import { useNames } from "@/lib/live/names";
import { useSession } from "@/lib/live/session";
import type { DisplayCurrency } from "@/lib/money";
import { useInstall } from "@/lib/pwa";
import { LanguagePicker } from "./LanguagePicker";

const CURRENCIES: DisplayCurrency[] = ["INR", "AED", "GBP", "USD"];

/**
 * First screen: language and currency (pre-filled), then one Face ID creates the account. The passkey is the only
 * way into Turn: no wallet, no email, no password. Returning on a new device is the same single prompt.
 */
export function Welcome() {
  const t = useT();
  const router = useRouter();
  const prefs = useStore((s) => s.prefs);
  const { create, signIn, busy } = useSession();
  const names = useNames();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [support, setSupport] = useState<"yes" | "no" | "unknown">("unknown");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [link, setLink] = useState("");
  const [badLink, setBadLink] = useState(false);
  const install = useInstall();
  useRates(); // warm the exchange rates for the next screen

  useEffect(() => {
    startRun("create");
    void prfSupport().then(setSupport);
  }, []);

  function explain(e: unknown, fallback: string) {
    const kind = passkeyErrorKind(e);
    setErr(kind === "unsupported" ? t("live.noPrf") : kind === "cancelled" ? t("live.cancelled") : fallback);
  }

  async function createAccount() {
    tap();
    setErr(null);
    try {
      await create(name.trim());
      if (name.trim()) await names.setMe(name.trim());
    } catch (e) {
      explain(e, t("live.createFailed"));
    }
  }

  async function signInExisting() {
    tap();
    setErr(null);
    try {
      await signIn();
    } catch (e) {
      explain(e, t("live.signInFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-4 pt-2 text-center">
        <div className="w-40" aria-hidden>
          <TurnRing members={["Meera", "Arjun", "Fatima", "Ravi", "Sanjay"].map((n) => ({ name: n }))} step={1} />
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
        <div className="flex flex-col gap-2">
          <label htmlFor="your-name" className="text-sm font-semibold">
            {t("live.yourName")}
          </label>
          <input
            id="your-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("create.yourNamePlaceholder")}
            autoComplete="given-name"
            maxLength={30}
            className="border-line-strong bg-paper-raised min-h-12 rounded-xl border px-4"
          />
          <p className="text-ink-muted text-xs">{t("live.yourNameHint")}</p>
        </div>
        {support === "no" && <p className="bg-warning-soft rounded-xl px-4 py-3 text-sm">{t("live.noPrfHere")}</p>}
        {err && (
          <p role="alert" className="text-danger text-sm">
            {err}
          </p>
        )}
        <Button size="lg" onClick={createAccount} busy={busy}>
          {t("live.createAccount")}
        </Button>
        <Button variant="outline" size="lg" onClick={signInExisting} disabled={busy}>
          {t("live.haveAccount")}
        </Button>
        <p className="text-ink-muted text-center text-xs">{t("live.passkeyOnly")}</p>

        <Button variant="ghost" onClick={() => setInviteOpen((o) => !o)} aria-expanded={inviteOpen} aria-controls="invite-form">
          {t("welcome.haveInvite")}
        </Button>
        {inviteOpen && (
          <form
            id="invite-form"
            className="bg-paper-sunk flex flex-col gap-3 rounded-2xl p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const path = joinPathFromLink(link);
              if (!path) return setBadLink(true);
              tap();
              router.push(path);
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
                setBadLink(false);
              }}
              aria-invalid={badLink}
              aria-describedby={badLink ? "invite-error" : undefined}
              className="border-line-strong bg-paper-raised min-h-12 rounded-xl border px-4"
              placeholder="https://…/app/join/0x…"
              inputMode="url"
            />
            {badLink && (
              <p id="invite-error" className="text-danger text-sm">
                {t("welcome.badInvite")}
              </p>
            )}
            <Button type="submit" variant="secondary">
              {t("welcome.open")}
            </Button>
          </form>
        )}
        {!install.standalone && (
          <Link href="/app/get" className="text-teal-ink mx-auto inline-flex min-h-11 items-center gap-2 font-semibold underline-offset-4 hover:underline">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
              <path d="M10.5 18.5h3" />
            </svg>
            {t("install.cardTitle")}
          </Link>
        )}
      </div>
    </div>
  );
}
