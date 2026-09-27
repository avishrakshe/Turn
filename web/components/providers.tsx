"use client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SessionProvider, useSession } from "@/lib/session";
import { guessCurrency, type Rates } from "@/lib/money";
import { myCircles } from "@/lib/indexer";
import { startRun } from "@/lib/metrics";
import { NamesProvider } from "./names";

type Prefs = { currency: string; setCurrency: (c: string) => void; rates: Rates };
const PrefsCtx = createContext<Prefs>({ currency: "INR", setCurrency: () => {}, rates: {} });

function PrefsProvider({ children }: { children: ReactNode }) {
  const { address } = useSession();
  const [chosen, setChosen] = useState<string | null>(null);
  const [guess, setGuess] = useState("INR");
  useEffect(() => setGuess(guessCurrency()), []);
  const rates = useQuery({
    queryKey: ["fx"],
    queryFn: async () => ((await (await fetch("/api/fx")).json()) as { rates: Rates }).rates,
    staleTime: 3_600_000,
  });
  // The member's currency is recorded onchain with their circles, so it follows them to any device.
  const me = useQuery({
    queryKey: ["my", address],
    queryFn: () => myCircles(address!),
    enabled: Boolean(address),
    refetchInterval: 4_000,
  });
  const onchain = me.data?.Member[0]?.displayCurrency;
  const currency = chosen ?? (onchain && onchain !== "USD" ? onchain : guess);
  return (
    <PrefsCtx.Provider value={{ currency, setCurrency: setChosen, rates: rates.data ?? {} }}>{children}</PrefsCtx.Provider>
  );
}

export function usePrefs() {
  return useContext(PrefsCtx);
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } }));
  useEffect(() => startRun(window.location.pathname.startsWith("/join") ? "join" : "create"), []);
  return (
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <PrefsProvider>
          <NamesProvider>{children}</NamesProvider>
        </PrefsProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
