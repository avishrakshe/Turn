"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useMoney, useStore } from "@/lib/app/hooks";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import {
  connect,
  disconnect,
  FAUCET_AMOUNT,
  formatStable,
  MONAD_TESTNET,
  requestTestTokens,
  shortAddress,
  STABLECOIN,
  switchToMonad,
  useStablecoinBalance,
  useWallet,
  walletDeepLinks,
} from "@/lib/wallet";

/** Header control: "Connect wallet", or the connected wallet's short address. Opens the wallet sheet. */
export function WalletButton() {
  const t = useT();
  const w = useWallet();
  const [open, setOpen] = useState(false);
  if (!w.ready) return <span className="h-9 w-9" aria-hidden />;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-pill border px-3 text-sm font-semibold transition-colors",
          w.status === "connected" ? "border-line bg-paper-raised text-ink" : "border-teal/40 text-teal-ink hover:bg-teal-soft",
        )}
      >
        {w.status === "connected" && w.address ? (
          <>
            <WalletIcon src={w.wallet?.icon} size={18} />
            <span className="tabular">{shortAddress(w.address)}</span>
            {w.chainId !== MONAD_TESTNET.id && <span aria-hidden className="bg-warning size-2 rounded-full" />}
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 7.5A2.5 2.5 0 016.5 5H18v3" />
              <rect x="4" y="8" width="16" height="11" rx="2.5" />
              <path d="M16 13.5h1.5" />
            </svg>
            <span className="max-[380px]:sr-only">{t("wallet.connect")}</span>
          </>
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={w.status === "connected" ? t("wallet.account") : t("wallet.title")}>
        <div className="pb-6">
          <WalletPanel />
        </div>
      </Sheet>
    </>
  );
}

/** Everything about the wallet: connect, or show account, network, balance, test tokens. */
export function WalletPanel() {
  const w = useWallet();
  return w.status === "connected" && w.address ? <Connected address={w.address} /> : <WalletList />;
}

/** The wallets this browser has, or how to get one. */
export function WalletList({ onConnected }: { onConnected?: () => void }) {
  const t = useT();
  const w = useWallet();
  const [touch, setTouch] = useState(false);
  const [here, setHere] = useState("");
  useEffect(() => {
    setTouch(matchMedia("(pointer: coarse)").matches);
    setHere(window.location.href);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-muted">{t("wallet.lead")}</p>
      {w.wallets.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {w.wallets.map((info) => (
            <li key={info.uuid}>
              <button
                type="button"
                disabled={w.status === "connecting"}
                onClick={async () => {
                  if (await connect(info.uuid)) onConnected?.();
                }}
                className="border-line bg-paper-raised hover:border-line-strong flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-start font-semibold transition-colors disabled:opacity-60"
              >
                <WalletIcon src={info.icon} size={28} />
                <span className="flex-1">{info.name}</span>
                <svg viewBox="0 0 20 20" className="text-ink-muted size-5 rtl:-scale-x-100" aria-hidden>
                  <path d="M7.5 4.5L13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : touch && here ? (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{t("wallet.openIn")}</p>
          {walletDeepLinks(here).map((l) => (
            <a key={l.name} href={l.href} className="border-line bg-paper-raised flex min-h-12 items-center rounded-2xl border px-4 font-semibold">
              {l.name}
            </a>
          ))}
        </div>
      ) : (
        <div className="bg-paper-sunk rounded-2xl p-4">
          <p className="font-semibold">{t("wallet.none")}</p>
          <p className="text-ink-muted mt-1 text-sm">{t("wallet.install")}</p>
        </div>
      )}
      <p aria-live="polite" className={cn("text-sm", w.error ? "text-danger" : "text-ink-muted")}>
        {w.status === "connecting" ? t("wallet.connecting") : w.error ? t(`wallet.${w.error}`) : t("wallet.demoNote")}
      </p>
    </div>
  );
}

function Connected({ address }: { address: `0x${string}` }) {
  const t = useT();
  const toast = useToast();
  const w = useWallet();
  const { fmt } = useMoney();
  const { balance, refresh } = useStablecoinBalance(address);
  const [balanceFailed, setBalanceFailed] = useState(false);
  const [faucet, setFaucet] = useState<"idle" | "busy" | "sent" | "failed">("idle");
  const [tx, setTx] = useState<string | null>(null);
  const onMonad = w.chainId === MONAD_TESTNET.id;

  useEffect(() => {
    // The public RPC can be slow: only call it a failure after a few seconds without an answer.
    if (balance !== null) return setBalanceFailed(false);
    const id = window.setTimeout(() => setBalanceFailed(true), 6000);
    return () => window.clearTimeout(id);
  }, [balance]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <WalletIcon src={w.wallet?.icon} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{w.wallet?.name}</p>
          <p className="tabular text-ink-muted truncate font-mono text-sm">{shortAddress(address)}</p>
        </div>
        <Button
          variant="outline"
          className="min-h-10 px-4 text-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(address);
              toast({ tone: "success", title: t("wallet.copied") });
            } catch {
              toast({ tone: "warning", title: address });
            }
          }}
        >
          {t("wallet.copy")}
        </Button>
      </div>

      <div className="border-line rounded-2xl border">
        <div className="border-line flex items-center justify-between gap-3 border-b px-4 py-3">
          <span className="text-ink-muted text-sm">{t("wallet.network")}</span>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden className={cn("size-2 rounded-full", onMonad ? "bg-success" : "bg-warning")} />
            {onMonad ? MONAD_TESTNET.name : `Chain ${w.chainId}`}
          </span>
        </div>
        <div className="px-4 py-4">
          <p className="text-ink-muted text-sm">{t("wallet.balance")}</p>
          {balance !== null ? (
            <>
              <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
                {formatStable(balance)} <span className="text-ink-muted text-lg font-medium">{STABLECOIN.symbol}</span>
              </p>
              <p className="text-ink-muted tabular text-sm">≈ {fmt(balance)}</p>
            </>
          ) : balanceFailed ? (
            <p className="text-ink-muted mt-1 text-sm">{t("wallet.balanceError")}</p>
          ) : (
            <Skeleton className="mt-2 h-9 w-40" />
          )}
          {STABLECOIN.isTest && <p className="text-ink-muted mt-2 text-xs">{t("wallet.testToken")}</p>}
        </div>
      </div>

      {!onMonad && (
        <div className="bg-warning-soft flex flex-col gap-3 rounded-2xl p-4">
          <p className="text-sm font-medium">{t("wallet.wrongNetwork")}</p>
          <Button variant="secondary" className="self-start" onClick={() => switchToMonad()}>
            {t("wallet.switch")}
          </Button>
        </div>
      )}

      {STABLECOIN.isTest && (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            busy={faucet === "busy"}
            onClick={async () => {
              setFaucet("busy");
              try {
                setTx(await requestTestTokens());
                setFaucet("sent");
                // Monad confirms in about a second; read again shortly after.
                window.setTimeout(refresh, 2500);
              } catch {
                setFaucet("failed");
              }
            }}
          >
            {t("wallet.faucet", { amount: formatStable(FAUCET_AMOUNT).replace(/\.00$/, ""), symbol: STABLECOIN.symbol })}
          </Button>
          {faucet === "sent" && (
            <p className="text-success text-sm" role="status">
              {t("wallet.faucetSent")}{" "}
              {tx && (
                <a href={`${MONAD_TESTNET.explorer}/tx/${tx}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                  {t("wallet.explorer")}
                </a>
              )}
            </p>
          )}
          {faucet === "failed" && (
            <p className="text-danger text-sm" role="status">
              {t("wallet.faucetFailed")}
            </p>
          )}
        </div>
      )}

      <div className="border-line flex items-center justify-between gap-3 border-t pt-4">
        <a href={`${MONAD_TESTNET.explorer}/address/${address}`} target="_blank" rel="noopener noreferrer" className="text-teal-ink min-h-11 content-center text-sm font-semibold underline-offset-4 hover:underline">
          {t("wallet.explorer")}
        </a>
        <Button variant="ghost" className="text-danger" onClick={disconnect}>
          {t("wallet.disconnect")}
        </Button>
      </div>
      <p className="text-ink-muted text-xs">{t("wallet.demoNote")}</p>
    </div>
  );
}

/**
 * When paying in stablecoins: how much each payment is in the stablecoin, and from which
 * wallet (or a prompt to connect one). Renders nothing for local-money payers.
 */
export function PayMethodLine({ units }: { units: bigint }) {
  const t = useT();
  const w = useWallet();
  const payWith = useStore((s) => s.prefs.payWith);
  const [open, setOpen] = useState(false);
  if (payWith !== "stablecoin" || !w.ready) return null;
  const connected = w.status === "connected" && w.address;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-teal-soft text-teal-ink flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-2 text-start text-sm font-semibold"
      >
        <span aria-hidden className="bg-teal text-on-teal grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold">
          $
        </span>
        <span className="flex-1">
          {connected
            ? t("wallet.paysFrom", { amount: formatStable(units), symbol: STABLECOIN.symbol, address: shortAddress(w.address!) })
            : t("wallet.connectToPay", { symbol: STABLECOIN.symbol })}
        </span>
        <svg viewBox="0 0 20 20" className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden>
          <path d="M7.5 4.5L13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={connected ? t("wallet.account") : t("wallet.title")}>
        <div className="pb-6">
          <WalletPanel />
        </div>
      </Sheet>
    </>
  );
}

/** A wallet's own icon (a data: URI from EIP-6963), or a neutral wallet glyph. */
function WalletIcon({ src, size }: { src?: string; size: number }) {
  if (src && /^data:image\/(svg\+xml|png|webp|jpeg)/.test(src)) {
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI supplied by the wallet itself
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-md" />;
  }
  return (
    <span aria-hidden className="bg-teal-soft text-teal-ink grid shrink-0 place-items-center rounded-md" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" style={{ width: size * 0.62, height: size * 0.62 }} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="4" y="7" width="16" height="12" rx="2.5" />
        <path d="M16 13h1.5M4 9.5h16" />
      </svg>
    </span>
  );
}
