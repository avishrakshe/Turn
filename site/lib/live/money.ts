// Small helpers for onchain values. Display formatting lives in lib/money.ts and lib/app/hooks.ts.

/** "INR" -> 0x494e52, the bytes3 currency code circles store for each member. */
export function currencyBytes3(code: string): `0x${string}` {
  return `0x${Array.from(code.slice(0, 3).toUpperCase(), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")}`;
}

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
