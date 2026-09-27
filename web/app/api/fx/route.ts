// FX rates for display only (settlement is always AUSD). Same source as the CRE workflow; cached for an hour.
export const revalidate = 3600;

const CURRENCIES = ["INR", "AED", "GBP", "EUR", "USD", "SAR", "QAR", "KWD", "OMR", "BHD"];

export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 3600 } });
    const body = (await res.json()) as { rates?: Record<string, number>; time_last_update_unix?: number };
    const rates: Record<string, number> = {};
    for (const c of CURRENCIES) if (body.rates?.[c]) rates[c] = body.rates[c]!;
    return Response.json({ rates, updatedAt: body.time_last_update_unix ?? null, source: "exchangerate-api.com" });
  } catch {
    return Response.json({ rates: { USD: 1 }, updatedAt: null, source: null });
  }
}
