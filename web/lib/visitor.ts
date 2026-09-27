import type { DisplayCurrency } from "./money";

// Best guess at a visitor's currency and city from what the browser already knows. Used for
// display only (stats, the footer clock); the user can always change it in the app.

const ZONE_CURRENCY: Record<string, DisplayCurrency> = {
  "Asia/Kolkata": "INR",
  "Asia/Calcutta": "INR",
  "Asia/Dubai": "AED",
  "Europe/London": "GBP",
};

export function guessCurrency(timeZone: string, language: string): DisplayCurrency {
  const byZone = ZONE_CURRENCY[timeZone];
  if (byZone) return byZone;
  if (/-IN$/i.test(language)) return "INR";
  if (/-AE$/i.test(language)) return "AED";
  if (/-GB$/i.test(language)) return "GBP";
  return "USD";
}

export const CITY: Record<string, string> = {
  "Asia/Kolkata": "Mumbai",
  "Asia/Calcutta": "Mumbai",
  "Asia/Dubai": "Dubai",
  "Asia/Riyadh": "Riyadh",
  "Asia/Qatar": "Doha",
  "Asia/Kuwait": "Kuwait City",
  "Asia/Muscat": "Muscat",
  "Asia/Bahrain": "Manama",
  "Europe/London": "London",
};

/** Partner city for the footer clock: the other end of the corridor. */
export function partnerZone(timeZone: string): string {
  if (timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta") return "Asia/Dubai";
  return "Asia/Kolkata";
}
