import { getUsdRates } from "@/lib/fx";

// Display-only exchange rates for the app, cached for an hour.
export const revalidate = 3600;

export async function GET() {
  const rates = await getUsdRates();
  return Response.json({ rates, live: rates.INR !== undefined, at: Date.now() });
}
