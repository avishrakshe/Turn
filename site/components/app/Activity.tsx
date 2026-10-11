"use client";

import { useDate, useMoney } from "@/lib/app/hooks";
import { useT } from "@/lib/i18n";
import { AGORA_TESTNET, txUrl } from "@/lib/live/config";
import { useTransfers } from "@/lib/live/hooks";
import { useNames } from "@/lib/live/names";
import { useSession } from "@/lib/live/session";

/** Money you sent to or received from people (not circle payments), each linked to its transaction. */
export function Activity() {
  const t = useT();
  const { fmt } = useMoney();
  const date = useDate();
  const { address } = useSession();
  const names = useNames();
  const transfers = useTransfers();
  const rows = transfers.data?.Transfer ?? [];
  if (rows.length === 0) return null;

  const who = (a: string) => (a.toLowerCase() === AGORA_TESTNET.faucet.toLowerCase() ? t("live.agoraFaucet") : names.person(a, t("common.you")));

  return (
    <section aria-labelledby="activity-h" className="flex flex-col gap-3">
      <h2 id="activity-h" className="text-ink-muted font-sans text-sm font-semibold tracking-normal">
        {t("live.activity")}
      </h2>
      <ul className="bg-paper-raised border-line divide-line divide-y rounded-card border" data-testid="activity">
        {rows.map((r) => {
          const incoming = r.to.toLowerCase() === address?.toLowerCase();
          return (
            <li key={r.id}>
              <a href={txUrl(r.txHash)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{incoming ? t("live.receivedFrom", { name: who(r.from) }) : t("live.sentTo", { name: who(r.to) })}</span>
                  <span className="text-ink-muted block text-xs">{date(new Date(Number(r.timestamp) * 1000))}</span>
                </span>
                <span className={`tabular shrink-0 font-semibold ${incoming ? "text-success" : ""}`}>
                  {incoming ? "+" : "−"}
                  {fmt(BigInt(r.amount))}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
