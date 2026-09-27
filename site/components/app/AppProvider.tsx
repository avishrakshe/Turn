"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { UiLabelsContext } from "@/components/ui/labels";
import { Sheet } from "@/components/ui/Sheet";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { useStore } from "@/lib/app/hooks";
import { I18nProvider, langInfo, translate, useT } from "@/lib/i18n";
import { registerServiceWorker } from "@/lib/pwa";
import { shortAddress, signConfirmation, useWallet } from "@/lib/wallet";
import { WalletList } from "./Wallet";
import { scriptFontClass } from "@/lib/script-fonts";
import { FaceGlyph } from "./FaceGlyph";

interface AppApi {
  /** Ask for Face ID. Resolves true once confirmed, false if dismissed. */
  passkey: (summary: string) => Promise<boolean>;
  /** Confirmation toast with a Details link, after a money action. */
  receipt: (title: string, description?: string) => void;
}

const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const lang = useStore((s) => s.prefs.language);
  const { dir, script } = langInfo(lang);

  // The app sets the document language, direction and script font, so RTL (Urdu) flips the
  // whole layout and sheets and toasts (portalled to <body>) pick up the script font too.
  useEffect(() => {
    const html = document.documentElement;
    const font = scriptFontClass[script];
    html.lang = lang;
    html.dir = dir;
    if (font) html.classList.add(font);
    return () => {
      html.lang = "en";
      html.dir = "ltr";
      if (font) html.classList.remove(font);
    };
  }, [lang, dir, script]);

  useEffect(registerServiceWorker, []);

  const labels = useMemo(
    () => ({ close: translate(lang, "common.close"), dismiss: translate(lang, "common.dismiss"), notifications: translate(lang, "common.notifications") }),
    [lang],
  );

  return (
    <I18nProvider lang={lang}>
      <UiLabelsContext.Provider value={labels}>
        <ToastProvider regionClassName="bottom-16 sm:bottom-0">
          <Inner>{children}</Inner>
        </ToastProvider>
      </UiLabelsContext.Provider>
    </I18nProvider>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const t = useT();
  const toast = useToast();
  const [ask, setAsk] = useState<{ summary: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [details, setDetails] = useState(false);
  const [declined, setDeclined] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const byWallet = useStore((s) => s.prefs.payWith === "stablecoin");
  const wallet = useWallet();

  const passkey = useCallback((summary: string) => {
    setAsk({ summary });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setAsk(null);
    setChecking(false);
    setDeclined(false);
  };

  const receipt = useCallback(
    (title: string, description?: string) =>
      toast({ tone: "success", title: `${t("common.confirmed")} · ${title}`, description, action: { label: t("common.details"), onClick: () => setDetails(true) } }),
    [toast, t],
  );

  return (
    <AppContext.Provider value={{ passkey, receipt }}>
      {children}
      <Sheet
        open={!!ask}
        onClose={() => !checking && finish(false)}
        title={byWallet ? t("wallet.confirmTitle") : t("passkey.title")}
        description={ask?.summary}
      >
        {byWallet ? (
          // Paying with stablecoins: the wallet signs instead of Face ID. A real signature prompt,
          // with a message that says plainly that nothing is sent.
          wallet.status === "connected" && wallet.address ? (
            <div className="flex flex-col gap-4 pt-2 pb-4">
              <div className="bg-paper-sunk flex items-center gap-3 rounded-2xl px-4 py-3">
                <span aria-hidden className="bg-success size-2 rounded-full" />
                <span className="font-semibold">{wallet.wallet?.name}</span>
                <span className="tabular text-ink-muted ms-auto font-mono text-sm">{shortAddress(wallet.address)}</span>
              </div>
              <Button
                size="lg"
                className="w-full"
                busy={checking}
                onClick={async () => {
                  setDeclined(false);
                  setChecking(true);
                  const ok = await signConfirmation(t("wallet.signMessage", { summary: ask?.summary ?? "" }));
                  if (ok) finish(true);
                  else {
                    setChecking(false);
                    setDeclined(true);
                  }
                }}
              >
                {checking ? t("wallet.confirmWaiting") : t("wallet.confirmButton", { wallet: wallet.wallet?.name ?? "" })}
              </Button>
              <p aria-live="polite" className={declined ? "text-danger text-sm" : "text-ink-muted text-xs"}>
                {declined ? t("wallet.rejected") : t("wallet.demoNote")}
              </p>
            </div>
          ) : (
            <div className="pt-2 pb-4">
              <p className="mb-3 font-semibold">{t("wallet.confirmNeedsWallet")}</p>
              <WalletList />
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-5 pt-2 pb-4 text-center">
            <FaceGlyph scanning={checking} />
            <Button
              size="lg"
              className="w-full"
              busy={checking}
              onClick={() => {
                setChecking(true);
                window.setTimeout(() => finish(true), 700);
              }}
            >
              {checking ? t("passkey.working") : t("passkey.confirm")}
            </Button>
            <p className="text-ink-muted text-xs">{t("passkey.demoNote")}</p>
          </div>
        )}
      </Sheet>
      <Sheet open={details} onClose={() => setDetails(false)} title={t("common.details")}>
        <p className="text-ink-muted pb-6">{t("common.demoNoTx")}</p>
      </Sheet>
    </AppContext.Provider>
  );
}
