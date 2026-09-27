"use client";
// Private address book, encrypted with the passkey's "vault" namespace (AES-256-GCM). The server stores ciphertext
// only; any device with the same passkey decrypts it. Names never touch the chain or the indexer.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { getAddress, type Address } from "viem";
import { open, seal, type Sealed } from "@/lib/passkey";
import { useSession } from "@/lib/session";
import { vaultWriteMessage } from "@/lib/vault-message";
import { shortAddr } from "@/lib/money";

type Book = { people: Record<string, string>; circles: Record<string, string>; me?: string };
const EMPTY: Book = { people: {}, circles: {} };

type NamesState = {
  unlocked: boolean;
  unlocking: boolean;
  error: string | null;
  unlock: () => Promise<void>;
  person: (a: string) => string;
  personName: (a: string) => string | undefined;
  circle: (c: string, fallback: string) => string;
  setPerson: (a: string, name: string) => Promise<void>;
  setCircle: (c: string, name: string) => Promise<void>;
  /** Remember a circle name from an invite link until the vault is unlocked, then save it. */
  remember: (c: string, name: string) => void;
};

const Ctx = createContext<NamesState | null>(null);

export function NamesProvider({ children }: { children: ReactNode }) {
  const { address, account, unlock: unlockNs } = useSession();
  // The decrypted book belongs to one account; switching accounts (or locking) makes it invisible immediately.
  const [state, setState] = useState<{ owner: string; book: Book } | null>(null);
  const book = state && address && state.owner === address ? state.book : null;
  const setBook = useCallback((b: Book) => address && setState({ owner: address, book: b }), [address]);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<{ owner: string; prf: Uint8Array<ArrayBuffer> } | null>(null);
  const pending = useRef<Record<string, string>>({});

  const persist = useCallback(
    async (next: Book) => {
      if (!address || !account || key.current?.owner !== address) return;
      const sealed = await seal(key.current.prf, next);
      const timestamp = Math.floor(Date.now() / 1000);
      // Signed by the account (no prompt: session is in memory) so only you can replace your vault.
      const signature = await account.signMessage({ message: await vaultWriteMessage(sealed, timestamp) });
      await fetch(`/api/vault/${address}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sealed, timestamp, signature }),
      });
    },
    [address, account],
  );

  const unlock = useCallback(async () => {
    if (!address || book) return;
    setUnlocking(true);
    setError(null);
    try {
      const prf = await unlockNs("vault");
      key.current = { owner: address, prf };
      const res = (await (await fetch(`/api/vault/${address}`, { cache: "no-store" })).json()) as { sealed: Sealed | null };
      let loaded = res.sealed ? await open<Book>(prf, res.sealed) : EMPTY;
      const pend = pending.current;
      if (Object.keys(pend).length) {
        loaded = { ...loaded, circles: { ...pend, ...loaded.circles } };
        pending.current = {};
        await persist(loaded);
      }
      setBook(loaded);
    } catch {
      setError("Couldn't unlock names. Please try again.");
    } finally {
      setUnlocking(false);
    }
  }, [address, book, unlockNs, persist, setBook]);

  const update = useCallback(
    async (fn: (b: Book) => Book) => {
      if (!book) return;
      const next = fn(book);
      setBook(next);
      await persist(next);
    },
    [book, persist, setBook],
  );

  const value = useMemo<NamesState>(
    () => ({
      unlocked: book !== null,
      unlocking,
      error,
      unlock,
      personName: (a) => (a.toLowerCase() === address?.toLowerCase() ? "You" : book?.people[getAddress(a)]),
      person: (a) => (a.toLowerCase() === address?.toLowerCase() ? "You" : (book?.people[getAddress(a)] ?? shortAddr(a))),
      circle: (c, fallback) => book?.circles[getAddress(c)] ?? pending.current[getAddress(c)] ?? fallback,
      setPerson: (a, name) => update((b) => ({ ...b, people: { ...b.people, [getAddress(a)]: name.trim().slice(0, 40) } })),
      setCircle: (c, name) => update((b) => ({ ...b, circles: { ...b.circles, [getAddress(c)]: name.trim().slice(0, 40) } })),
      remember: (c, name) => {
        if (!name) return;
        if (book) void update((b) => ({ ...b, circles: { ...b.circles, [getAddress(c)]: name.slice(0, 40) } }));
        else pending.current[getAddress(c)] = name.slice(0, 40);
      },
    }),
    [book, unlocking, error, unlock, update, address],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNames() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNames outside NamesProvider");
  return v;
}

export function UnlockNames({ compact }: { compact?: boolean }) {
  const n = useNames();
  if (n.unlocked) return null;
  return (
    <button
      onClick={() => void n.unlock()}
      disabled={n.unlocking}
      className={`flex items-center gap-2 rounded-2xl border border-dashed border-line bg-surface px-4 py-3 text-left text-sm font-semibold text-primary ${compact ? "" : "w-full"}`}
    >
      <span aria-hidden>🔒</span>
      <span className="flex-1">
        {n.unlocking ? "Unlocking…" : "Show names"}
        {!compact && <span className="block text-xs font-medium text-muted">Names are end-to-end encrypted. Only your passkey can read them.</span>}
      </span>
    </button>
  );
}

export type { Address };
