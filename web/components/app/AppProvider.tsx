"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { useStore } from "@/lib/app/hooks";
import { I18nProvider, LANGUAGES, useT } from "@/lib/i18n";
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
  const dir = LANGUAGES.find((l) => l.code === lang)?.dir ?? "ltr";

  // The app sets the document language and direction, so RTL (Urdu) flips the whole layout.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    return () => {
      document.documentElement.lang = "en";
      document.documentElement.dir = "ltr";
    };
  }, [lang, dir]);

  return (
    <I18nProvider lang={lang}>
      <ToastProvider regionClassName="bottom-16 sm:bottom-0">
        <Inner>{children}</Inner>
      </ToastProvider>
    </I18nProvider>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const t = useT();
  const toast = useToast();
  const [ask, setAsk] = useState<{ summary: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [details, setDetails] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

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
  };

  const receipt = useCallback(
    (title: string, description?: string) =>
      toast({ tone: "success", title: `${t("common.confirmed")} · ${title}`, description, action: { label: t("common.details"), onClick: () => setDetails(true) } }),
    [toast, t],
  );

  return (
    <AppContext.Provider value={{ passkey, receipt }}>
      {children}
      <Sheet open={!!ask} onClose={() => !checking && finish(false)} title={t("passkey.title")} description={ask?.summary}>
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
      </Sheet>
      <Sheet open={details} onClose={() => setDetails(false)} title={t("common.details")}>
        <p className="text-ink-muted pb-6">{t("common.demoNoTx")}</p>
      </Sheet>
    </AppContext.Provider>
  );
}
