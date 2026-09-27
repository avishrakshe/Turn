import Link from "next/link";
import { TurnMark } from "@/components/ring/TurnMark";
import { score, trustBps } from "@/lib/economics/trust";
import { Section } from "./Section";

// The example card's score comes from the real formula, for the record it shows.
const EXAMPLE = { circlesJoined: 3, circlesCompleted: 3, paymentsOnTime: 15, paymentsLate: 0, defaults: 0, totalContributed: 0n };

export function TurnScore() {
  const s = score(EXAMPLE);
  const trust = trustBps(EXAMPLE) / 100;
  return (
    <Section
      id="score"
      round={9}
      label="Turn Score"
      title="Your honesty, finally on record."
      intro="Every payment you make on time is recorded, permanently and publicly, as your Turn Score. Take it anywhere: any app can check it, without asking you for bank statements."
    >
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <figure className="mx-auto w-full max-w-md">
          <div className="bg-teal text-on-teal shadow-lift relative aspect-[1.6/1] overflow-hidden rounded-[1.6rem] p-6 sm:p-7">
            <svg aria-hidden viewBox="0 0 200 200" className="absolute -end-16 -top-16 size-64 opacity-20">
              <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
              {Array.from({ length: 8 }, (_, i) => {
                const a = ((i * 45 - 90) * Math.PI) / 180;
                return <circle key={i} cx={100 + 70 * Math.cos(a)} cy={100 + 70 * Math.sin(a)} r={i === 1 ? 14 : 9} fill="currentColor" />;
              })}
            </svg>
            <div className="relative flex h-full flex-col">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="bg-paper grid size-8 place-items-center rounded-full">
                  <TurnMark size={22} />
                </span>
                Turn Score
              </div>
              <p className="font-display mt-auto text-6xl leading-none sm:text-7xl">{s}</p>
              <p className="mt-2 text-sm font-medium opacity-90">3 circles · 100% on time</p>
              <p className="mt-3 text-xs opacity-75">Verifiable onchain · link included when shared</p>
            </div>
          </div>
          <figcaption className="text-ink-muted mt-3 text-center text-sm">Example card, not a real person.</figcaption>
        </figure>
        <div className="flex flex-col gap-5">
          <ul className="flex flex-col gap-4">
            {[
              ["Earned, not bought", "It only goes up by paying your circle on time and finishing circles. Missed payments lower it."],
              ["It pays off", `With a record like the one on this card, you'd be asked to hold back up to ${trust}% less safety deposit when you take your turn early, as long as the circle's reserve can cover it.`],
              ["Yours to share", "Share a card with a link anyone can check, or keep it to yourself."],
            ].map(([t, b]) => (
              <li key={t} className="border-line border-s-2 ps-4">
                <p className="font-semibold">{t}</p>
                <p className="text-ink-muted mt-1">{b}</p>
              </li>
            ))}
          </ul>
          <Link href="/docs/turn-score" className="text-teal-ink font-semibold">
            How the score is calculated <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
          </Link>
        </div>
      </div>
    </Section>
  );
}
