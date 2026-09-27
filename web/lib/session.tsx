"use client";
// The passkey session. Everything lives in memory: a reload or a new device signs in again with Face ID and rebuilds
// identity from the passkey, and everything else from the chain and the Envio indexer.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Address, LocalAccount } from "viem";
import { accountFromPrf, createPasskey, evaluate, mnemonicFromPrf, type AccountSession } from "./passkey";
import { track } from "./metrics";

type Unlocked = { vault?: Uint8Array<ArrayBuffer>; invite?: Uint8Array<ArrayBuffer> };

type SessionState = {
  address: Address | null;
  account: LocalAccount<"mera"> | null;
  busy: boolean;
  create: (name: string) => Promise<LocalAccount<"mera">>;
  signIn: () => Promise<LocalAccount<"mera">>;
  /** Fresh Face ID for sensitive actions (joining, big bids, withdrawals, auto-pay changes). */
  confirm: () => Promise<LocalAccount<"mera">>;
  /** Unlock another passkey namespace (one Face ID the first time, then kept in memory). */
  unlock: (ns: "vault" | "invite") => Promise<Uint8Array<ArrayBuffer>>;
  unlocked: (ns: "vault" | "invite") => boolean;
  exportPhrase: () => Promise<string>;
  signOut: () => void;
};

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AccountSession | null>(null);
  const [busy, setBusy] = useState(false);
  const extra = useRef<Unlocked>({});
  const [, force] = useState(0);

  const adopt = useCallback((prf: Uint8Array) => {
    const next = accountFromPrf(prf);
    prf.fill(0);
    setS((prev) => {
      prev?.session.end();
      return next;
    });
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

  const confirm = useCallback(
    () =>
      withBusy(async () => {
        const acct = adopt(await evaluate("account"));
        return acct.account;
      }),
    [adopt, withBusy],
  );

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
  }, [s]);

  const value = useMemo<SessionState>(
    () => ({
      address: s?.account.address ?? null,
      account: s?.account ?? null,
      busy,
      create,
      signIn,
      confirm,
      unlock,
      unlocked: (ns) => Boolean(extra.current[ns]),
      exportPhrase,
      signOut,
    }),
    [s, busy, create, signIn, confirm, unlock, exportPhrase, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
