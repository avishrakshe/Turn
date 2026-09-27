// Display-layer money formatting. Settlement is always AUSD (6 decimals) onchain; the user
// only ever sees their own currency. AUSD never appears on the main path.

export type DisplayCurrency = "INR" | "AED" | "GBP" | "USD";

/** Locale to use for a currency when the viewer's own locale doesn't imply one. */
export const currencyLocale: Record<DisplayCurrency, string> = {
  INR: "en-IN", // Indian grouping: ₹1,00,000
  AED: "en-AE",
  GBP: "en-GB",
  USD: "en-US",
};

export interface FormatMoneyOptions {
  /** BCP-47 locale. Defaults to the natural locale for the currency. */
  locale?: string;
  /** Force decimals. Default: none for whole amounts, 2 otherwise. */
  fractionDigits?: number;
}

const cache = new Map<string, Intl.NumberFormat>();

function formatter(amount: number, currency: DisplayCurrency, opts: FormatMoneyOptions): Intl.NumberFormat {
  // INR always uses Indian grouping, even when the UI language is en-US or en-AE.
  const locale =
    currency === "INR" && !opts.locale?.endsWith("-IN") ? "en-IN" : (opts.locale ?? currencyLocale[currency]);
  const digits = opts.fractionDigits ?? (Number.isInteger(amount) ? 0 : 2);
  const key = `${locale}|${currency}|${digits}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    cache.set(key, f);
  }
  return f;
}

export function formatMoney(amount: number, currency: DisplayCurrency, opts: FormatMoneyOptions = {}): string {
  return formatter(amount, currency, opts).format(amount);
}

/** Split into parts so the UI can style the symbol separately from the digits. */
export function formatMoneyParts(amount: number, currency: DisplayCurrency, opts: FormatMoneyOptions = {}) {
  return formatter(amount, currency, opts).formatToParts(amount);
}
