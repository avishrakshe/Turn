import Link from "next/link";
import { score, trustBps } from "@/lib/economics/trust";
import { ScoreCard3D } from "./ScoreCard3D";
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
        <ScoreCard3D
          score={s}
          summary="3 circles · 100% on time"
          record={[
            ["Circles joined", String(EXAMPLE.circlesJoined)],
            ["Circles completed", String(EXAMPLE.circlesCompleted)],
            ["Payments on time", String(EXAMPLE.paymentsOnTime)],
            ["Payments late", String(EXAMPLE.paymentsLate)],
            ["Missed", String(EXAMPLE.defaults)],
          ]}
        />
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
