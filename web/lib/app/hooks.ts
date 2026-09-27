"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { type DisplayCurrency, formatMoney } from "@/lib/money";
import { FALLBACK_RATES, type Rates, toLocal, toUnits } from "./money";
import { type State, store } from "./store";

/**
 * Subscribe to a slice of the store. The selector must return something already in the state
 * (s.circles, s.profile…), never a newly built object, or React will re-render forever.
 * Derive in the component with useMemo instead.
 */
export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.server()),
  );
}

/** False during server render and hydration, true after: avoids flashing the wrong screen. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

// Exchange rates are fetched once per page load and shared.
let ratesCache: { rates: Rates; live: boolean } | null = null;
let ratesPromise: Promise<{ rates: Rates; live: boolean }> | null = null;

function fetchRates() {
  ratesPromise ??= fetch("/api/fx")
    .then((r) => r.json())
    .then((j: { rates: Partial<Rates>; live: boolean }) => {
      ratesCache = { rates: { ...FALLBACK_RATES, ...j.rates }, live: j.live };
      return ratesCache;
    })
    .catch(() => (ratesCache = { rates: FALLBACK_RATES, live: false }));
  return ratesPromise;
}

export function useRates() {
  const [r, setR] = useState(ratesCache ?? { rates: FALLBACK_RATES, live: false });
  useEffect(() => {
    let alive = true;
    fetchRates().then((x) => alive && setR(x));
    return () => {
      alive = false;
    };
  }, []);
  return r;
}

/** Money in the viewer's currency, from AUSD base units. */
export function useMoney() {
  const currency = useStore((s) => s.prefs.currency);
  const { rates, live } = useRates();
  const fmt = useCallback((units: bigint, c: DisplayCurrency = currency) => formatMoney(toLocal(units, c, rates), c), [currency, rates]);
  const local = useCallback((units: bigint, c: DisplayCurrency = currency) => toLocal(units, c, rates), [currency, rates]);
  const units = useCallback((amount: number, c: DisplayCurrency = currency) => toUnits(amount, c, rates), [currency, rates]);
  return { fmt, local, units, currency, rates, live };
}

export function useDate() {
  return useCallback((d: Date, withYear = false) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }), []);
}
