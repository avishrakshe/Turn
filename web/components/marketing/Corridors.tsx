import { Section } from "./Section";
import styles from "./corridors.module.css";

// Schematic, not a map: three cities placed roughly west to east, joined by arcs.
const CITIES = {
  london: { x: 70, y: 70, label: "London" },
  dubai: { x: 330, y: 150, label: "Dubai" },
  mumbai: { x: 520, y: 205, label: "Mumbai" },
  kochi: { x: 560, y: 285, label: "Kochi" },
} as const;

type City = keyof typeof CITIES;
const ROUTES: Array<[City, City]> = [
  ["dubai", "mumbai"],
  ["dubai", "kochi"],
  ["london", "mumbai"],
];

function arc(a: City, b: City) {
  const p = CITIES[a];
  const q = CITIES[b];
  const mx = (p.x + q.x) / 2;
  const my = Math.min(p.y, q.y) - Math.abs(q.x - p.x) * 0.28;
  return `M ${p.x} ${p.y} Q ${mx} ${my} ${q.x} ${q.y}`;
}

export function Corridors() {
  return (
    <Section
      id="borders"
      round={7}
      label="Across borders"
      title="One circle, two countries"
      intro="Family in Dubai or London and family in India can save in the same circle. Money settles in about a second, and no bank transfer fees come out of the pot."
    >
      <figure className="bg-paper-raised border-line rounded-card max-w-4xl overflow-hidden border">
        <svg viewBox="0 0 640 340" className="block h-auto w-full" role="img" aria-label="Circles connect members in London and Dubai with family in Mumbai and Kochi.">
          {ROUTES.map(([a, b], i) => (
            <g key={`${a}-${b}`}>
              <path d={arc(a, b)} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
              <path d={arc(a, b)} fill="none" stroke="var(--marigold)" strokeWidth="3" strokeLinecap="round" className={styles.flow} style={{ animationDelay: `${i * 0.9}s` }} />
            </g>
          ))}
          {Object.values(CITIES).map((c) => (
            <g key={c.label}>
              <circle cx={c.x} cy={c.y} r="9" fill="var(--teal)" stroke="var(--paper-raised)" strokeWidth="3" />
              <text x={c.x} y={c.y + 30} textAnchor="middle" fill="var(--ink)" fontSize="16" fontWeight="600" style={{ fontFamily: "var(--font-dm-sans)" }}>
                {c.label}
              </text>
            </g>
          ))}
        </svg>
        <figcaption className="border-line text-ink-muted grid gap-4 border-t p-5 text-sm sm:grid-cols-3 sm:p-6">
          <p><span className="text-ink font-semibold">Gulf ↔ India.</span> Each member pays in dirhams or rupees, whichever they use.</p>
          <p><span className="text-ink font-semibold">UK ↔ India.</span> Pounds in London, rupees in Mumbai, one shared pot.</p>
          <p><span className="text-ink font-semibold">Honest note.</span> Adding money by card can carry the card provider&rsquo;s fee. Turn charges nothing during the beta.</p>
        </figcaption>
      </figure>
    </Section>
  );
}
