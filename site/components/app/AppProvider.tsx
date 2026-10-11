"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { UiLabelsContext } from "@/components/ui/labels";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { useStore } from "@/lib/app/hooks";
import { I18nProvider, langInfo, translate, useT } from "@/lib/i18n";
import { txUrl } from "@/lib/live/config";
import { NamesProvider } from "@/lib/live/names";
import { SessionProvider } from "@/lib/live/session";
import { registerServiceWorker } from "@/lib/pwa";
import { scriptFontClass } from "@/lib/script-fonts";

interface AppApi {
  /** Confirmation toast after a transaction, linking to it on the explorer. */
  receipt: (title: string, txHash?: string, description?: string) => void;
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
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 1_000, retry: 2 } } }));

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
    <QueryClientProvider client={queries}>
      <SessionProvider>
        <NamesProvider>
          <I18nProvider lang={lang}>
            <UiLabelsContext.Provider value={labels}>
              <ToastProvider regionClassName="bottom-16 sm:bottom-0">
                <Receipts>{children}</Receipts>
              </ToastProvider>
            </UiLabelsContext.Provider>
          </I18nProvider>
        </NamesProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

function Receipts({ children }: { children: ReactNode }) {
  const t = useT();
  const toast = useToast();
  const receipt = useCallback(
    (title: string, txHash?: string, description?: string) =>
      toast({
        tone: "success",
        title: `${t("common.confirmed")} · ${title}`,
        description,
        action: txHash ? { label: t("live.viewTx"), onClick: () => window.open(txUrl(txHash), "_blank", "noopener") } : undefined,
      }),
    [toast, t],
  );
  return <AppContext.Provider value={{ receipt }}>{children}</AppContext.Provider>;
}
