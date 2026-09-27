import Link from "next/link";
import { Section } from "./Section";

const CARDS = [
  {
    title: "Money is held by code, not a person",
    body: "The pot sits in the circle's own contract. Nobody, not the organiser and not us, can move it outside the rules everyone agreed to.",
    href: "/docs/circles",
    icon: (
      <path d="M8 11V8a4 4 0 118 0v3M6 11h12v9H6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    ),
  },
  {
    title: "Early winners leave a safety deposit",
    body: "Whoever takes the pot early leaves part of it behind, enough to cover what they still owe. It comes back to them as they keep paying.",
    href: "/docs/safety#withheld-collateral",
    icon: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />,
  },
  {
    title: "A reserve backs every circle",
    body: "A slice of every bid discount goes into a reserve. It only ever promises what it actually holds, so it can always pay out.",
    href: "/docs/safety#protection-reserve",
    icon: <path d="M4 9h16M4 9l8-5 8 5M6 9v8M10 9v8M14 9v8M18 9v8M4 20h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />,
  },
];

export function Safety() {
  return (
    <Section
      id="safety"
      round={8}
      label="Safety"
      title="Built so nobody can run off with the pot"
      intro="The worry with every committee is the same: what if someone takes their turn and disappears? Turn answers it with three rules. Each one is explained in full in the docs."
    >
      <ul className="grid gap-4 md:grid-cols-3">
        {CARDS.map((c) => (
          <li key={c.title}>
            <Link
              href={c.href}
              className="group bg-paper-raised border-line hover:border-line-strong rounded-card shadow-soft flex h-full flex-col gap-4 border p-6 transition-[border-color,translate] duration-(--duration-base) hover:-translate-y-0.5"
            >
              <span className="bg-teal-soft text-teal-ink grid size-11 place-items-center rounded-xl">
                <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
                  {c.icon}
                </svg>
              </span>
              <h3 className="text-2xl">{c.title}</h3>
              <p className="text-ink-muted">{c.body}</p>
              <span className="text-teal-ink mt-auto text-sm font-semibold">
                How it works <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-ink-muted mt-6 text-sm">
        Turn is in beta. The contracts have not been audited yet, and amounts are capped while we test with real families.
      </p>
    </Section>
  );
}
