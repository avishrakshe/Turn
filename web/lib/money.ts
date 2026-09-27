// Money in the user's own currency. AUSD (6 decimals, USD-pegged) sits underneath; FX is display-only.
export const CURRENCIES = [
  { code: "INR", label: "Indian rupee", flag: "🇮🇳" },
  { code: "AED", label: "UAE dirham", flag: "🇦🇪" },
  { code: "SAR", label: "Saudi riyal", flag: "🇸🇦" },
  { code: "QAR", label: "Qatari riyal", flag: "🇶🇦" },
  { code: "KWD", label: "Kuwaiti dinar", flag: "🇰🇼" },
  { code: "OMR", label: "Omani rial", flag: "🇴🇲" },
  { code: "BHD", label: "Bahraini dinar", flag: "🇧🇭" },
  { code: "GBP", label: "British pound", flag: "🇬🇧" },
  { code: "EUR", label: "Euro", flag: "🇪🇺" },
  { code: "USD", label: "US dollar", flag: "🇺🇸" },
] as const;

export type Rates = Record<string, number>;

export function toUsd(units: bigint | string | number): number {
  return Number(BigInt(units)) / 1e6;
}

export function fromUsd(usd: number): bigint {
  return BigInt(Math.round(usd * 1e6));
}

/** "₹9,588", "AED 367.25", "£75.51" — in the viewer's currency. */
export function fmt(units: bigint | string | number, currency: string, rates: Rates, opts: { compact?: boolean } = {}): string {
  const usd = toUsd(units);
  const rate = currency === "USD" ? 1 : rates[currency];
  const value = rate ? usd * rate : usd;
  const code = rate ? currency : "USD";
  return new Intl.NumberFormat(code === "INR" ? "en-IN" : "en", {
    style: "currency",
    currency: code,
    maximumFractionDigits: code === "INR" || opts.compact ? 0 : 2,
    minimumFractionDigits: code === "INR" || opts.compact ? 0 : undefined,
  }).format(value);
}

/** Convert an amount typed in local currency to token units (6 dp). */
export function localToUnits(amount: number, currency: string, rates: Rates): bigint {
  const rate = currency === "USD" ? 1 : rates[currency];
  return fromUsd(rate ? amount / rate : amount);
}

export function guessCurrency(): string {
  if (typeof navigator === "undefined") return "INR";
  const locale = navigator.language || "";
  const region = locale.split("-")[1]?.toUpperCase();
  const map: Record<string, string> = { IN: "INR", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", OM: "OMR", BH: "BHD", GB: "GBP", US: "USD" };
  return (region && map[region]) || "INR";
}

export function currencyBytes3(code: string): `0x${string}` {
  return `0x${Array.from(code.slice(0, 3).toUpperCase(), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")}`;
}

export function duration(seconds: number): string {
  const units: [number, string][] = [
    [86_400 * 30, "month"],
    [86_400 * 7, "week"],
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
  ];
  for (const [s, name] of units) {
    if (seconds >= s) {
      const n = Math.round(seconds / s);
      return `${n} ${name}${n === 1 ? "" : "s"}`;
    }
  }
  return `${seconds} seconds`;
}

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
