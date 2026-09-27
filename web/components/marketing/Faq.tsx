import Link from "next/link";
import type { ReactNode } from "react";
import { Section } from "./Section";

const QA: Array<{ q: string; a: ReactNode }> = [
  {
    q: "Is my money safe?",
    a: (
      <>
        The pot is held by the circle&rsquo;s own contract on the blockchain, not by a person and not by us. It can
        only move by the rules your circle agreed to. Turn is a beta and hasn&rsquo;t been audited yet, so amounts are
        capped and we suggest starting small. <Link href="/docs/security">Read our security notes.</Link>
      </>
    ),
  },
  {
    q: "What if someone stops paying?",
    a: (
      <>
        Before their turn, the deposit they paid when joining covers their first missed month. If they miss again,
        they&rsquo;re removed from the circle and get 90% of what they put in back at the end. After their turn, the
        safety deposit held back from their payout covers it, then the circle&rsquo;s reserve. Either way, you still
        get the full pot. <Link href="/docs/safety">How it works.</Link>
      </>
    ),
  },
  {
    q: "Do I need crypto?",
    a: "No. You sign in with Face ID or your phone's fingerprint. There's no seed phrase to write down and no network fees to pay. You add money by card or bank transfer where that's available.",
  },
  {
    q: "What currency is it held in?",
    a: "In AUSD, a US-dollar stablecoin issued by Agora, on the Monad network. You always see amounts in your own currency, such as rupees, dirhams or pounds. Because the pot is held in dollars, its value in your currency moves with the exchange rate.",
  },
  {
    q: "What are the fees?",
    a: "Turn charges no fees during the beta and pays the network costs for you. Adding money by card can carry the card provider's fee. If your circle uses bidding, the discounts go to the other members and the circle's reserve, never to Turn.",
  },
  {
    q: "Can I leave a circle?",
    a: "Once a circle has started, everyone is committed until it ends. That's what keeps every pot whole. You can switch off auto-pay at any time, but a missed payment is covered by your deposit and shows on your Turn Score. Leaving before a circle starts isn't supported in the beta yet.",
  },
  {
    q: "Is this legal where I live?",
    a: "Turn is a tool for groups of people who already know and trust each other, like a family or a group of coworkers. It isn't a bank or an investment product. Rules on savings committees and chit funds differ between countries and states, so please check what applies where you live before starting one.",
  },
];

export function Faq() {
  return (
    <Section id="faq" round={11} label="Questions" title="Good questions to ask">
      <div className="border-line divide-line max-w-3xl divide-y border-y">
        {QA.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              {q}
              <svg viewBox="0 0 20 20" className="text-ink-muted size-5 shrink-0 transition-transform duration-(--duration-base) group-open:rotate-45" aria-hidden>
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </summary>
            <div className="text-ink-muted [&_a]:text-teal-ink pb-6 leading-relaxed [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-4">{a}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}
