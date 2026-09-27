import type { DisplayCurrency } from "@/lib/money";

// AUSD has 6 decimals. Circles run in AUSD base units; members see their own currency.
export const AUSD_UNIT = 1_000_000;

export type Rates = Record<DisplayCurrency, number>;

/**
 * Used only until live rates load, or if they can't. AED is pegged at 3.6725. The others are
 * approximate, and the app says so when it's using them.
 */
export const FALLBACK_RATES: Rates = { USD: 1, AED: 3.6725, INR: 83, GBP: 0.79 };

export function toLocal(units: bigint, currency: DisplayCurrency, rates: Rates): number {
  const v = (Number(units) / AUSD_UNIT) * rates[currency];
  // Rupees are shown whole; the others to the cent.
  return currency === "INR" ? Math.round(v) : Math.round(v * 100) / 100;
}

export function toUnits(amount: number, currency: DisplayCurrency, rates: Rates): bigint {
  return BigInt(Math.round((amount / rates[currency]) * AUSD_UNIT));
}

/** A friendly default amount in any currency, rounded the way people actually save. */
export function niceAmount(usd: number, currency: DisplayCurrency, rates: Rates): number {
  const raw = usd * rates[currency];
  const step = currency === "INR" ? 500 : currency === "AED" ? 50 : 10;
  return Math.max(step, Math.round(raw / step) * step);
}
