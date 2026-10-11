import type { Lang } from "@/lib/i18n";
import type { DisplayCurrency } from "@/lib/money";
import { guessCurrency } from "@/lib/visitor";

// Display preferences for this browser: language and the currency amounts are shown in. A per-viewer convenience,
// nothing more. Everything that matters (account, circles, money, history) comes from the passkey, the chain and
// the Envio indexer, so clearing this only resets how things are shown.

const KEY = "turn-prefs-v1";

export interface Prefs {
  language: Lang;
  currency: DisplayCurrency;
}

export interface State {
  v: 1;
  prefs: Prefs;
}

const EMPTY: State = { v: 1, prefs: { language: "en", currency: "USD" } };

function load(): State {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s.v === 1 && s.prefs) return s;
    }
  } catch {
    // Unreadable or blocked storage: start fresh.
  }
  const currency = guessCurrency(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language);
  return { ...EMPTY, prefs: { ...EMPTY.prefs, currency } };
}

let state: State = load();
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: preferences last until the page closes.
  }
  listeners.forEach((l) => l());
}

export const store = {
  get: () => state,
  server: () => EMPTY,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setPrefs(p: Partial<Prefs>) {
    set({ ...state, prefs: { ...state.prefs, ...p } });
  },
};
