"use client";

import testnet from "@turn/contracts/deployments/10143.json";
import { useEffect, useState, useSyncExternalStore } from "react";

// Browser wallets, without a wallet SDK. Wallets announce themselves through EIP-6963 (so
// MetaMask, Rabby, Coinbase Wallet… can all be listed side by side), with window.ethereum as
// the fallback. We connect, keep the wallet on Monad testnet, read its stablecoin balance
// straight from the chain, and ask it to sign. In demo mode a signature is the confirmation:
// no transaction is sent and no funds move. The one real transaction is the test-token faucet.

export const MONAD_TESTNET = {
  id: 10143,
  hexId: "0x279f",
  name: "Monad Testnet",
  rpc: process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz",
  explorer: "https://testnet.monadvision.com",
};

/** The dollar stablecoin circles settle in. On testnet, the deployed MockAUSD (6 decimals). */
export const STABLECOIN = {
  address: testnet.token as `0x${string}`,
  symbol: testnet.mockToken ? "mAUSD" : "AUSD",
  decimals: 6,
  isTest: testnet.mockToken,
};

// Function selectors (keccak256 of the signature, first 4 bytes).
const BALANCE_OF = "0x70a08231"; // balanceOf(address)
const FAUCET = "0x7b56c2b2"; // faucet(address,uint256), MockAUSD only: mints up to 1,000 per call
export const FAUCET_AMOUNT = 1_000n * 10n ** 6n;

interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface WalletInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface Detail {
  info: WalletInfo;
  provider: Eip1193;
}

export interface WalletState {
  ready: boolean;
  wallets: WalletInfo[];
  status: "disconnected" | "connecting" | "connected";
  address: `0x${string}` | null;
  chainId: number | null;
  wallet: WalletInfo | null;
  error: string | null;
}

const LAST = "turn-wallet";
const SERVER: WalletState = { ready: false, wallets: [], status: "disconnected", address: null, chainId: null, wallet: null, error: null };

let state = SERVER;
const details = new Map<string, Detail>();
let active: Detail | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<WalletState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const onAccounts = (accounts: unknown) => {
  const a = (accounts as string[])[0] as `0x${string}` | undefined;
  if (a) update({ address: a, status: "connected" });
  else disconnect();
};
const onChain = (id: unknown) => update({ chainId: Number(id) });

function attach(d: Detail) {
  if (active) {
    active.provider.removeListener?.("accountsChanged", onAccounts);
    active.provider.removeListener?.("chainChanged", onChain);
  }
  active = d;
  d.provider.on?.("accountsChanged", onAccounts);
  d.provider.on?.("chainChanged", onChain);
}

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  state = { ...state, ready: true };
  window.addEventListener("eip6963:announceProvider", (e) => {
    const d = (e as CustomEvent<Detail>).detail;
    if (!d?.info?.uuid || details.has(d.info.uuid)) return;
    details.set(d.info.uuid, d);
    update({ wallets: [...details.values()].map((x) => x.info) });
    void reconnect(d);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  // Older wallets only inject window.ethereum.
  window.setTimeout(() => {
    const legacy = (window as Window & { ethereum?: Eip1193 & { isMetaMask?: boolean } }).ethereum;
    if (details.size === 0 && legacy) {
      const d: Detail = { info: { uuid: "injected", name: legacy.isMetaMask ? "MetaMask" : "Browser wallet", icon: "", rdns: "injected" }, provider: legacy };
      details.set(d.info.uuid, d);
      update({ wallets: [d.info] });
      void reconnect(d);
    }
  }, 400);
}

/** Quietly restores the last wallet if it's still authorised (no popup). */
async function reconnect(d: Detail) {
  if (state.status !== "disconnected" || lastRdns() !== d.info.rdns) return;
  try {
    const accounts = (await d.provider.request({ method: "eth_accounts" })) as string[];
    if (!accounts[0]) return;
    attach(d);
    const chainId = Number(await d.provider.request({ method: "eth_chainId" }));
    update({ status: "connected", address: accounts[0] as `0x${string}`, chainId, wallet: d.info, error: null });
  } catch {
    // Wallet locked or unavailable: stay disconnected.
  }
}

function lastRdns() {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}

export function useWallet(): WalletState {
  return useSyncExternalStore(
    (l) => {
      start();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (start(), state),
    () => SERVER,
  );
}

export async function connect(uuid: string): Promise<boolean> {
  const d = details.get(uuid);
  if (!d) return false;
  update({ status: "connecting", error: null });
  try {
    const accounts = (await d.provider.request({ method: "eth_requestAccounts" })) as string[];
    attach(d);
    const chainId = Number(await d.provider.request({ method: "eth_chainId" }));
    update({ status: "connected", address: accounts[0] as `0x${string}`, chainId, wallet: d.info });
    try {
      localStorage.setItem(LAST, d.info.rdns);
    } catch {
      // Private mode: it just won't reconnect by itself next time.
    }
    return true;
  } catch (e) {
    update({ status: "disconnected", error: errorCode(e) });
    return false;
  }
}

export function disconnect() {
  const d = active;
  if (d) {
    d.provider.removeListener?.("accountsChanged", onAccounts);
    d.provider.removeListener?.("chainChanged", onChain);
    // Revokes the site's access where the wallet supports it (MetaMask does); harmless elsewhere.
    d.provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => {});
  }
  active = null;
  try {
    localStorage.removeItem(LAST);
  } catch {
    // Nothing to forget.
  }
  update({ status: "disconnected", address: null, chainId: null, wallet: null, error: null });
}

/** Moves the wallet to Monad testnet, adding the network first if the wallet doesn't know it. */
export async function switchToMonad(): Promise<boolean> {
  if (!active) return false;
  try {
    await active.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MONAD_TESTNET.hexId }] });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) return false;
    try {
      await active.provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: MONAD_TESTNET.hexId,
            chainName: MONAD_TESTNET.name,
            nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
            rpcUrls: [MONAD_TESTNET.rpc],
            blockExplorerUrls: [MONAD_TESTNET.explorer],
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Asks the wallet to sign a plain-language message. This is the demo's payment confirmation:
 * it proves the person controls the wallet, and moves nothing. Resolves false if they decline.
 */
export async function signConfirmation(message: string): Promise<boolean> {
  if (!active || !state.address) return false;
  const hex = `0x${Array.from(new TextEncoder().encode(message), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  try {
    await active.provider.request({ method: "personal_sign", params: [hex, state.address] });
    return true;
  } catch {
    return false;
  }
}

/** Mints test stablecoins to the connected wallet (testnet only). Returns the transaction hash. */
export async function requestTestTokens(): Promise<string> {
  if (!active || !state.address || !STABLECOIN.isTest) throw new Error("no-wallet");
  if (state.chainId !== MONAD_TESTNET.id && !(await switchToMonad())) throw new Error("wrong-chain");
  const pad = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
  const data = `${FAUCET}${pad(state.address)}${pad(FAUCET_AMOUNT.toString(16))}`;
  return (await active.provider.request({ method: "eth_sendTransaction", params: [{ from: state.address, to: STABLECOIN.address, data }] })) as string;
}

/** The address's stablecoin balance in base units, read from the chain through a public RPC. */
export async function readBalance(address: string): Promise<bigint> {
  const res = await fetch(MONAD_TESTNET.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: STABLECOIN.address, data: `${BALANCE_OF}${address.replace(/^0x/, "").toLowerCase().padStart(64, "0")}` }, "latest"],
    }),
  });
  const json = (await res.json()) as { result?: string; error?: unknown };
  if (!json.result) throw new Error("rpc");
  return BigInt(json.result);
}

/** Live balance for the connected wallet; `refresh` re-reads it (after a faucet, say). */
export function useStablecoinBalance(address: string | null) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!address) return setBalance(null);
    let alive = true;
    readBalance(address)
      .then((b) => alive && setBalance(b))
      .catch(() => alive && setBalance(null));
    return () => {
      alive = false;
    };
  }, [address, tick]);
  return { balance, refresh: () => setTick((t) => t + 1) };
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** 1234567890 base units → "1,234.57". */
export const formatStable = (units: bigint) => (Number(units) / 10 ** STABLECOIN.decimals).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function errorCode(e: unknown) {
  return (e as { code?: number }).code === 4001 ? "rejected" : "failed";
}

/** Links that open this page inside a phone wallet's own browser (no extension on phones). */
export function walletDeepLinks(url: string) {
  const bare = url.replace(/^https?:\/\//, "");
  return [
    { name: "MetaMask", href: `https://metamask.app.link/dapp/${bare}` },
    { name: "Coinbase Wallet", href: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
    { name: "Trust Wallet", href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}` },
  ];
}
