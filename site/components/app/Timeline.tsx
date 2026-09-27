"use client";

import { Avatar } from "@/components/ui/Avatar";
import { useMoney } from "@/lib/app/hooks";
import { memberName, timeline } from "@/lib/app/selectors";
import type { CircleRec } from "@/lib/app/store";
import { useT } from "@/lib/i18n";

/** Who received what, and anything that went wrong, newest first, in plain words. */
export function Timeline({ circle: c }: { circle: CircleRec }) {
  const t = useT();
  const { fmt } = useMoney();
  const items = timeline(c);

  return (
    <section aria-labelledby="timeline-h" className="flex flex-col gap-3">
      <h2 id="timeline-h" className="text-2xl">
        {t("circle.timeline")}
      </h2>
      {items.length === 0 ? (
        <p className="text-ink-muted">{t("circle.timelineEmpty")}</p>
      ) : (
        <ol className="border-line flex flex-col border-s-2 ps-5">
          {items.map((it, i) => {
            let text: string;
            let who: string | null = null;
            let tone = "bg-teal";
            switch (it.kind) {
              case "payout":
                who = memberName(c, it.winner);
                text =
                  t("circle.tlPayout", { round: it.round, name: who, amount: fmt(it.amount) }) +
                  (it.discountBps > 0 ? ` ${t("circle.tlDiscount", { pct: it.discountBps / 100 })}` : "");
                tone = "bg-marigold";
                break;
              case "missed":
                who = memberName(c, it.member);
                text = t(it.via === "deposit" ? "circle.tlMissedDeposit" : it.via === "collateral" ? "circle.tlMissedCollateral" : "circle.tlMissedReserve", { name: who });
                tone = "bg-warning";
                break;
              case "ejected":
                who = memberName(c, it.member);
                text = t("circle.tlEjected", { name: who });
                tone = "bg-danger";
                break;
              case "settle":
                text = t("circle.tlSettle");
                break;
              case "complete":
                text = t("circle.tlComplete", { amount: fmt(it.share) });
                tone = "bg-success";
                break;
            }
            return (
              <li key={i} className="relative pb-5 last:pb-0">
                <span aria-hidden className={`absolute -start-[1.72rem] top-1.5 size-3 rounded-full ring-4 ring-[var(--paper)] ${tone}`} />
                <div className="flex items-start gap-3">
                  {who && <Avatar name={who} size={28} />}
                  <p className="leading-snug">{text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
