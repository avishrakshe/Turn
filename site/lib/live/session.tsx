"use client";
// The passkey session (mera). Turn has no other way to sign in.
//
// - One Face ID derives the account key from the passkey (PRF -> BIP-39 -> BIP-44) into a mera signing session. The key
//   lives in memory only, and the session is *scoped*: it signs routine actions (paying a round, bids of 10% or less,
//   display currency) for SESSION_MINUTES, then ends itself and zeroes the key.
// - Sensitive actions (joining or starting a circle, withdrawing, bids over 10%, auto-pay changes, the recovery
//   phrase) always ask for Face ID again, unless you confirmed in the last RECENT_SECONDS. That's what makes
//   onboarding a single prompt: creating the passkey and joining your first circle are one confirmation.
// - Contributions don't need the session at all: auto-pay is an onchain pull grant (TurnAccount), collected by the
//   keeper whether or not the app is open.
// - The *public* address is remembered for this tab (sessionStorage) so a refresh shows your circles read-only.
//   A wiped browser or a new device needs nothing but the passkey: circles, money and history come from the chain
//   and the Envio indexer.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Address, LocalAccount } from "viem";
import { track } from "./metrics";
import { accountFromPrf, createPasskey, evaluate, mnemonicFromPrf, subkey, type AccountSession } from "./passkey";

export const SESSION_MINUTES = 15;
export const RECENT_SECONDS = 90;
/** Bids above this need a fresh Face ID. */
export const QUICK_BID_BPS = 1000;

type Unlocked = { vault?: Uint8Array<ArrayBuffer>; invite?: Uint8Array<ArrayBuffer> };

type SessionState = {
  /** Your address: from the live session, or remembered for this tab after a refresh. */
  address: Address | null;
  /** The live signer, while the scoped session is open. */
  account: LocalAccount<"mera"> | null;
  /** When the scoped session ends (ms since epoch), or null when there's none. */
  expiresAt: number | null;
  /** Address known but no signer (after a refresh, or after the session ended). */
  locked: boolean;
  busy: boolean;
  /** New account: creates the passkey and opens the session in one prompt. */
  create: (name: string) => Promise<LocalAccount<"mera">>;
  signIn: () => Promise<LocalAccount<"mera">>;
  /** Routine actions: the open session, or one Face ID if it has ended. */
  quick: () => Promise<LocalAccount<"mera">>;
  /** Sensitive actions: Face ID again, unless you confirmed moments ago. */
  confirm: () => Promise<LocalAccount<"mera">>;
  /** A purpose key (names vault, invite secrets) from the open session, or after one Face ID. */
  unlock: (ns: "vault" | "invite") => Promise<Uint8Array<ArrayBuffer>>;
  exportPhrase: () => Promise<string>;
  /** End the session now (key zeroed); you stay signed in read-only. */
  lock: () => void;
  signOut: () => void;
};

const Ctx = createContext<SessionState | null>(null);

// ---- remembered address (public, per tab) --------------------------------------------------------------------
const ADDR_KEY = "turn.address";
const listeners = new Set<() => void>();
function readAddr(): Address | null {
  try {
    return (sessionStorage.getItem(ADDR_KEY) as Address | null) ?? null;
  } catch {
    return null;
  }
}
function writeAddr(a: Address | null) {
  try {
    if (a) sessionStorage.setItem(ADDR_KEY, a);
    else sessionStorage.removeItem(ADDR_KEY);
  } catch {}
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

type Live = AccountSession & { expiresAt: number; confirmedAt: number };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Live | null>(null);
  const [busy, setBusy] = useState(false);
  const remembered = useSyncExternalStore(subscribe, readAddr, () => null);
  const extra = useRef<Unlocked>({});
  const live = useRef<Live | null>(null);
  live.current = s;

  const end = useCallback(() => {
    live.current?.session.end();
    extra.current.vault?.fill(0);
    extra.current.invite?.fill(0);
    extra.current = {};
    setS(null);
  }, []);

  // The session ends itself when its time is up.
  useEffect(() => {
    if (!s) return;
    const t = window.setTimeout(end, Math.max(0, s.expiresAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [s, end]);

  const adopt = useCallback(async (prf: Uint8Array<ArrayBuffer>) => {
    const next = accountFromPrf(prf);
    extra.current = { vault: await subkey(prf, "vault"), invite: await subkey(prf, "invite") };
    prf.fill(0);
    const now = Date.now();
    const value: Live = { ...next, expiresAt: now + SESSION_MINUTES * 60_000, confirmedAt: now };
    live.current?.session.end();
    live.current = value;
    setS(value);
    writeAddr(next.account.address);
    track("passkey");
    return value;
  }, []);

  const withBusy = useCallback(async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const create = useCallback((name: string) => withBusy(async () => (await adopt(await createPasskey(name))).account), [adopt, withBusy]);
  const signIn = useCallback(() => withBusy(async () => (await adopt(await evaluate("account"))).account), [adopt, withBusy]);

  const quick = useCallback(async () => {
    const cur = live.current;
    return cur && cur.expiresAt > Date.now() ? cur.account : signIn();
  }, [signIn]);

  const confirm = useCallback(async () => {
    const cur = live.current;
    return cur && Date.now() - cur.confirmedAt < RECENT_SECONDS * 1000 ? cur.account : signIn();
  }, [signIn]);

  // Vault and invite keys come with the session; after it ends, one Face ID brings all three back.
  const unlock = useCallback(
    async (ns: "vault" | "invite") => {
      if (!extra.current[ns]) await signIn();
      return extra.current[ns]!;
    },
    [signIn],
  );

  const exportPhrase = useCallback(
    () =>
      withBusy(async () => {
        const prf = await evaluate("account");
        const phrase = mnemonicFromPrf(prf);
        prf.fill(0);
        return phrase;
      }),
    [withBusy],
  );

  const signOut = useCallback(() => {
    end();
    writeAddr(null);
  }, [end]);

  const address = s?.account.address ?? remembered;
  const value = useMemo<SessionState>(
    () => ({
      address,
      account: s?.account ?? null,
      expiresAt: s?.expiresAt ?? null,
      locked: !s && Boolean(address),
      busy,
      create,
      signIn,
      quick,
      confirm,
      unlock,
      exportPhrase,
      lock: end,
      signOut,
    }),
    [address, s, busy, create, signIn, quick, confirm, unlock, exportPhrase, end, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
