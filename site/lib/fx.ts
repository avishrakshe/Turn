import "server-only";
import type { DisplayCurrency } from "./money";

// Display-only exchange rates (USD base). Settlement never depends on these.
export type Rates = Partial<Record<DisplayCurrency, number>>;

export async function getUsdRates(): Promise<Rates> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { USD: 1 };
    const json = (await res.json()) as { rates?: Record<string, number> };
    const r = json.rates ?? {};
    return { USD: 1, INR: r.INR, AED: r.AED, GBP: r.GBP };
  } catch {
    return { USD: 1 };
  }
}
