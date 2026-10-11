"use client";
// Private address book: your name, circle names and what you call people. Encrypted with the passkey's vault key
// (AES-256-GCM); the server stores ciphertext only, and any device with the same passkey decrypts it. Names never
// touch the chain or the indexer. The book opens by itself whenever the passkey session does.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAddress } from "viem";
import { shortAddr } from "./money";
import { open, seal, type Sealed } from "./passkey";
import { useSession } from "./session";
import { vaultWriteMessage } from "./vault-message";

type Book = { people: Record<string, string>; circles: Record<string, string>; me?: string };
const EMPTY: Book = { people: {}, circles: {} };

type NamesState = {
  /** The book is decrypted for the current account. */
  ready: boolean;
  me: string | undefined;
  /** "You" for yourself, the saved name, or a short address. */
  person: (a: string, you: string) => string;
  circle: (c: string, fallback: string) => string;
  setMe: (name: string) => Promise<void>;
  setPerson: (a: string, name: string) => Promise<void>;
  /** Save a circle name (from the create form or an invite link). Held until the book is open, then saved. */
  remember: (c: string, name: string) => void;
};

const Ctx = createContext<NamesState | null>(null);

export function NamesProvider({ children }: { children: ReactNode }) {
  const { address, account, quick, unlock } = useSession();
  // The decrypted book belongs to one account; switching accounts makes it invisible immediately.
  const [state, setState] = useState<{ owner: string; book: Book } | null>(null);
  const book = state && address && state.owner === address ? state.book : null;
  const pending = useRef<{ circles: Record<string, string>; me?: string }>({ circles: {} });
  const loading = useRef<string | null>(null);

  const persist = useCallback(
    async (owner: string, next: Book) => {
      const sealed = await seal(await unlock("vault"), next);
      const timestamp = Math.floor(Date.now() / 1000);
      // Signed by the account so only you can replace your vault.
      const signer = await quick();
      const signature = await signer.signMessage({ message: await vaultWriteMessage(sealed, timestamp) });
      await fetch(`/api/vault/${owner}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sealed, timestamp, signature }) });
    },
    [quick, unlock],
  );

  // Open the book as soon as there's a session for this address (no extra prompt: the key comes with it).
  useEffect(() => {
    if (!account || book || loading.current === account.address) return;
    const owner = account.address;
    loading.current = owner;
    void (async () => {
      try {
        const key = await unlock("vault");
        const res = (await (await fetch(`/api/vault/${owner}`, { cache: "no-store" })).json()) as { sealed: Sealed | null };
        let loaded = res.sealed ? await open<Book>(key, res.sealed) : EMPTY;
        const pend = pending.current;
        if (Object.keys(pend.circles).length || (pend.me && !loaded.me)) {
          loaded = { ...loaded, me: loaded.me ?? pend.me, circles: { ...pend.circles, ...loaded.circles } };
          pending.current = { circles: {} };
          await persist(owner, loaded);
        }
        setState({ owner, book: loaded });
      } catch (e) {
        console.warn("[turn] couldn't open the names vault:", e);
      } finally {
        loading.current = null;
      }
    })();
  }, [account, book, unlock, persist]);

  const update = useCallback(
    async (fn: (b: Book) => Book) => {
      if (!book || !address) return;
      const next = fn(book);
      setState({ owner: address, book: next });
      await persist(address, next);
    },
    [book, address, persist],
  );

  const value = useMemo<NamesState>(
    () => ({
      ready: book !== null,
      me: book?.me ?? pending.current.me,
      person: (a, you) => (a.toLowerCase() === address?.toLowerCase() ? you : (book?.people[getAddress(a)] ?? shortAddr(a))),
      circle: (c, fallback) => book?.circles[getAddress(c)] ?? pending.current.circles[getAddress(c)] ?? fallback,
      setMe: (name) => {
        if (book) return update((b) => ({ ...b, me: name.trim().slice(0, 40) }));
        pending.current.me = name.trim().slice(0, 40) || undefined;
        return Promise.resolve();
      },
      setPerson: (a, name) => update((b) => ({ ...b, people: { ...b.people, [getAddress(a)]: name.trim().slice(0, 40) } })),
      remember: (c, name) => {
        if (!name) return;
        if (book) void update((b) => ({ ...b, circles: { ...b.circles, [getAddress(c)]: name.slice(0, 40) } }));
        else pending.current.circles[getAddress(c)] = name.slice(0, 40);
      },
    }),
    [book, update, address],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNames() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNames outside NamesProvider");
  return v;
}
