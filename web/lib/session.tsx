"use client";
// The passkey session.
// - The signing key lives in memory only. It is rebuilt from the passkey (Face ID) and zeroed on lock.
// - The *public* address is remembered for this browser tab (sessionStorage), so a refresh shows your circles
//   right away, read-only. The first action that needs a signature asks for Face ID once.
// - A new device or a wiped browser needs nothing but the passkey: identity from the passkey; circles, money and
//   history from the chain and the Envio indexer.
import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Address, LocalAccount } from "viem";
import { accountFromPrf, createPasskey, evaluate, mnemonicFromPrf, type AccountSession } from "./passkey";
import { track } from "./metrics";

type Unlocked = { vault?: Uint8Array<ArrayBuffer>; invite?: Uint8Array<ArrayBuffer> };

type SessionState = {
  /** Your address: from the live session, or remembered for this tab after a refresh. */
  address: Address | null;
  /** The live signer, if unlocked in this page load. */
  account: LocalAccount<"mera"> | null;
  /** Address known but no signer yet (after a refresh). */
  locked: boolean;
  busy: boolean;
  create: (name: string) => Promise<LocalAccount<"mera">>;
  signIn: () => Promise<LocalAccount<"mera">>;
  /** The signer, asking for Face ID only if this page load doesn't have one yet. */
  ensureAccount: () => Promise<LocalAccount<"mera">>;
  /** Always asks for Face ID: joining, big bids, withdrawals, auto-pay changes. */
  confirm: () => Promise<LocalAccount<"mera">>;
  unlock: (ns: "vault" | "invite") => Promise<Uint8Array<ArrayBuffer>>;
  unlocked: (ns: "vault" | "invite") => boolean;
  exportPhrase: () => Promise<string>;
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AccountSession | null>(null);
  const [busy, setBusy] = useState(false);
  const remembered = useSyncExternalStore(subscribe, readAddr, () => null);
  const extra = useRef<Unlocked>({});
  const [, force] = useState(0);

  const adopt = useCallback((prf: Uint8Array) => {
    const next = accountFromPrf(prf);
    prf.fill(0);
    setS((prev) => {
      prev?.session.end();
      return next;
    });
    writeAddr(next.account.address);
    return next;
  }, []);

  const withBusy = useCallback(async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const create = useCallback(
    (name: string) =>
      withBusy(async () => {
        const acct = adopt(await createPasskey(name));
        track("passkey");
        return acct.account;
      }),
    [adopt, withBusy],
  );

  const signIn = useCallback(
    () =>
      withBusy(async () => {
        const acct = adopt(await evaluate("account"));
        track("passkey");
        return acct.account;
      }),
    [adopt, withBusy],
  );

  const confirm = useCallback(() => withBusy(async () => adopt(await evaluate("account")).account), [adopt, withBusy]);

  const ensureAccount = useCallback(async () => (s ? s.account : signIn()), [s, signIn]);

  const unlock = useCallback(
    (ns: "vault" | "invite") =>
      withBusy(async () => {
        const have = extra.current[ns];
        if (have) return have;
        const prf = await evaluate(ns);
        extra.current[ns] = prf;
        force((x) => x + 1);
        return prf;
      }),
    [withBusy],
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
    s?.session.end();
    extra.current.vault?.fill(0);
    extra.current.invite?.fill(0);
    extra.current = {};
    setS(null);
    writeAddr(null);
  }, [s]);

  const address = s?.account.address ?? remembered;
  const value = useMemo<SessionState>(
    () => ({
      address,
      account: s?.account ?? null,
      locked: !s && Boolean(address),
      busy,
      create,
      signIn,
      ensureAccount,
      confirm,
      unlock,
      unlocked: (ns) => Boolean(extra.current[ns]),
      exportPhrase,
      signOut,
    }),
    [address, s, busy, create, signIn, ensureAccount, confirm, unlock, exportPhrase, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
