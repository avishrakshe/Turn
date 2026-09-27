import Link from "next/link";
import { TurnLogo } from "@/components/ring/TurnMark";
import { CHAIN, LINKS, TAGLINE } from "@/lib/site";
import { DualClock } from "./DualClock";

export function Footer() {
  const links = [
    { href: "/docs", label: "Docs" },
    { href: LINKS.github, label: "GitHub", external: true },
    ...(CHAIN && process.env.NEXT_PUBLIC_CIRCLE_FACTORY_ADDRESS
      ? [{ href: `${CHAIN.explorer}/address/${process.env.NEXT_PUBLIC_CIRCLE_FACTORY_ADDRESS}`, label: "Contracts", external: true }]
      : [{ href: "/docs/contracts", label: "Contracts" }]),
    { href: LINKS.x, label: `X ${LINKS.xHandle}`, external: true },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ];
  return (
    <footer className="border-line border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-14 sm:px-8">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <TurnLogo />
            <p className="font-display mt-4 text-2xl">{TAGLINE}</p>
          </div>
          <DualClock />
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-2 gap-y-1">
            {links.map((l) => (
              <li key={l.label}>
                {"external" in l && l.external ? (
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center rounded-lg px-2 font-medium">
                    {l.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : (
                  <Link href={l.href} className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center rounded-lg px-2 font-medium">
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-line text-ink-muted flex flex-col justify-between gap-3 border-t pt-6 text-sm sm:flex-row">
          <p>Beta · unaudited · built for the Monad Metropolis hackathon</p>
          <p className="font-semibold">Built on Monad</p>
        </div>
      </div>
    </footer>
  );
}
