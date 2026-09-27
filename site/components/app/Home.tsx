"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useMoney, useStore } from "@/lib/app/hooks";
import { creditRecord, payoutOf, yourTurn } from "@/lib/app/selectors";
import { score } from "@/lib/economics/trust";
import { useT } from "@/lib/i18n";
import { CircleCard } from "./CircleCard";
import { InstallCard } from "./InstallCard";

export function Home() {
  const t = useT();
  const { fmt } = useMoney();
  const profile = useStore((s) => s.profile);
  const circles = useStore((s) => s.circles);
  const order = useStore((s) => s.order);
  const state = useStore((s) => s);
  const myScore = useMemo(() => score(creditRecord(state)), [state]);
  const list = order.map((id) => circles[id]!).filter(Boolean);

  const banners = list
    .map((c) => ({ c, turn: yourTurn(c) }))
    .filter((x) => x.turn !== null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl">{t("home.greeting", { name: profile?.name ?? "" })}</h1>
        <Link href="/app/score" className="bg-teal-soft text-teal-ink inline-flex min-h-11 items-center gap-2 rounded-pill px-4 text-sm font-semibold">
          <span className="tabular text-base">{myScore}</span> {t("nav.score")}
        </Link>
      </div>

      {banners.map(({ c, turn }) => {
        const paid = payoutOf(c.history.at(-1)?.events ?? []);
        return (
          <Card key={c.id} tone="turn" className="flex flex-col gap-2">
            <p className="font-display text-xl">{turn === "won" ? t("home.yourTurnBanner", { circle: c.name }) : t("home.yourTurnSoon", { circle: c.name })}</p>
            {turn === "won" && paid && <p className="text-ink-muted">{t("home.yourTurnBody", { amount: fmt(paid.netPaid) })}</p>}
            <Link href={`/app/circle/${c.id}`} className="text-marigold-ink min-h-11 self-start py-2 font-semibold underline underline-offset-4">
              {c.name} →
            </Link>
          </Card>
        );
      })}

      <section aria-labelledby="circles-h" className="flex flex-col gap-3">
        <h2 id="circles-h" className="font-sans text-sm font-semibold tracking-normal text-ink-muted">
          {t("home.yourCircles")}
        </h2>
        {list.length === 0 ? (
          <Card tone="sunk">
            <EmptyState title={t("home.emptyTitle")} body={t("home.emptyBody")} />
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((c) => (
              <li key={c.id}>
                <CircleCard circle={c} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ButtonLink href="/app/create" size="lg">
        {t("home.start")}
      </ButtonLink>

      <InstallCard />
    </div>
  );
}
