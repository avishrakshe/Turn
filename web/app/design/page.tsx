import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ProgressRing } from "@/components/ring/ProgressRing";
import { RingLoader } from "@/components/ring/RingLoader";
import { TurnLogo, TurnMark } from "@/components/ring/TurnMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Amount } from "@/components/ui/Amount";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stat } from "@/components/ui/Stat";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { scriptFontClass } from "@/lib/script-fonts";
import { ButtonsDemo, RingPlayground, SegmentedDemo, SheetDemo, StepperDemo, ToastDemo } from "./demos";

// Hidden page: not linked from the site, and kept out of search results.
export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const SWATCHES: Array<{ group: string; tokens: Array<{ name: string; role: string; onVar?: string }> }> = [
  {
    group: "Paper & ink",
    tokens: [
      { name: "paper", role: "Page background" },
      { name: "paper-raised", role: "Cards, sheets" },
      { name: "paper-sunk", role: "Wells, inputs" },
      { name: "line", role: "Hairlines" },
      { name: "ink", role: "Text", onVar: "paper" },
      { name: "ink-muted", role: "Secondary text", onVar: "paper" },
    ],
  },
  {
    group: "Accents",
    tokens: [
      { name: "marigold", role: "Your turn · primary CTA", onVar: "on-marigold" },
      { name: "marigold-soft", role: "Turn highlight", onVar: "marigold-ink" },
      { name: "teal", role: "Trust · money", onVar: "on-teal" },
      { name: "teal-soft", role: "Trust surfaces", onVar: "teal-ink" },
    ],
  },
  {
    group: "Semantic",
    tokens: [
      { name: "success", role: "Paid, on time", onVar: "paper" },
      { name: "warning", role: "Late payment", onVar: "paper" },
      { name: "danger", role: "Missed / default", onVar: "paper" },
      { name: "success-soft", role: "Paid surface", onVar: "success" },
      { name: "warning-soft", role: "Late surface", onVar: "warning" },
      { name: "danger-soft", role: "Default surface", onVar: "danger" },
    ],
  },
];

const SPECIMENS: Array<{ lang: string; dir?: "rtl"; script: keyof typeof scriptFontClass; name: string; text: string }> = [
  { lang: "en", script: "latin", name: "English", text: "It's your turn. This month's pot is ₹25,000." },
  { lang: "hi", script: "devanagari", name: "Hindi · Devanagari", text: "आपकी बारी है। इस महीने की रकम ₹25,000 है।" },
  { lang: "ml", script: "malayalam", name: "Malayalam", text: "നിങ്ങളുടെ ഊഴമാണ്. ഈ മാസത്തെ തുക ₹25,000." },
  { lang: "ta", script: "tamil", name: "Tamil", text: "உங்கள் முறை. இந்த மாதத் தொகை ₹25,000." },
  { lang: "ur", dir: "rtl", script: "arabic", name: "Urdu · Arabic script, RTL", text: "آپ کی باری ہے۔ اس مہینے کی رقم ⁦₹25,000⁩ ہے۔" },
];

function Section({ id, chapter, title, intro, children }: { id: string; chapter: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="border-line scroll-mt-24 border-t py-14 sm:py-20">
      <p className="chapter">{chapter}</p>
      <h2 id={`${id}-h`} className="mt-3 text-3xl sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="text-ink-muted mt-3 max-w-2xl">{intro}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Swatch({ name, role, onVar }: { name: string; role: string; onVar?: string }) {
  return (
    <li className="border-line bg-paper-raised overflow-hidden rounded-2xl border">
      <div className="grid h-20 place-items-center border-b border-[var(--line)]" style={{ background: `var(--${name})` }}>
        {onVar && (
          <span className="text-lg font-semibold" style={{ color: `var(--${onVar})` }}>
            Aa ₹5,000
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="font-mono text-xs font-semibold">--{name}</p>
        <p className="text-ink-muted text-xs">{role}</p>
      </div>
    </li>
  );
}

export default function DesignPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
      <header className="bg-paper/85 border-line sticky top-0 z-20 -mx-5 flex items-center justify-between gap-4 border-b px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <TurnLogo />
        <ThemeToggle />
      </header>

      <div className="py-14 sm:py-20">
        <p className="chapter">Design system · v0.1</p>
        <h1 className="mt-3 max-w-3xl text-5xl sm:text-7xl">Family money, handled with care.</h1>
        <p className="text-ink-muted mt-5 max-w-2xl text-lg">
          The building blocks for Turn: warm paper, marigold for the moment it&rsquo;s your turn, and teal for
          trust. Every colour pair on this page passes WCAG 2.2 AA in both themes (checked by{" "}
          <code className="bg-paper-sunk rounded px-1.5 py-0.5 text-sm">pnpm contrast</code>). Amounts here are
          sample values for illustration.
        </p>
        <nav aria-label="Sections" className="mt-8 flex flex-wrap gap-2">
          {[
            ["ring", "Ring"],
            ["colour", "Colour"],
            ["type", "Type"],
            ["money", "Money"],
            ["components", "Components"],
            ["feedback", "Feedback"],
            ["motion", "Motion"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="border-line hover:border-line-strong inline-flex min-h-11 items-center rounded-pill border px-4 text-sm font-semibold">
              {label}
            </a>
          ))}
        </nav>
      </div>

      <Section
        id="ring"
        chapter="Round 01 · The ring"
        title="Whose turn it is"
        intro="The one motif. Members sit around a circle and a warm marker moves one seat each round. It's the hero animation, the circle-progress component, the loading state and the logo."
      >
        <RingPlayground />
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <Card className="flex flex-col items-start gap-4">
            <p className="text-sm font-semibold">ProgressRing</p>
            <div className="flex items-center gap-4">
              <ProgressRing round={1} total={5} />
              <ProgressRing round={3} total={6} />
              <ProgressRing round={4} total={6} yourTurn />
              <ProgressRing round={9} total={12} size={48} />
            </div>
            <p className="text-ink-muted text-xs">One segment per round. Marigold only when it&rsquo;s your turn.</p>
          </Card>
          <Card className="flex flex-col items-start gap-4">
            <p className="text-sm font-semibold">RingLoader</p>
            <div className="flex items-center gap-5">
              <RingLoader size={20} />
              <RingLoader size={32} />
              <RingLoader size={48} />
            </div>
            <p className="text-ink-muted text-xs">For short waits. For content, use skeletons instead.</p>
          </Card>
          <Card className="flex flex-col items-start gap-4">
            <p className="text-sm font-semibold">Logo mark</p>
            <div className="flex items-center gap-5">
              <TurnMark size={20} />
              <TurnMark size={32} />
              <TurnMark size={56} title="Turn" />
            </div>
            <p className="text-ink-muted text-xs">Six seats with one lit, caught mid-journey. The favicon uses the same mark.</p>
          </Card>
        </div>
      </Section>

      <Section id="colour" chapter="Round 02 · Colour" title="Warm paper, marigold, teal" intro="No pure black or white, no neon, no purple-to-blue gradients. Marigold is rationed: the primary action and the 'your turn' moment.">
        <div className="flex flex-col gap-10">
          {SWATCHES.map((g) => (
            <div key={g.group}>
              <h3 className="text-ink-muted mb-3 font-sans text-sm font-semibold tracking-normal">{g.group}</h3>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {g.tokens.map((t) => (
                  <Swatch key={t.name} {...t} />
                ))}
              </ul>
            </div>
          ))}
          <div>
            <h3 className="text-ink-muted mb-3 font-sans text-sm font-semibold tracking-normal">Member avatars</h3>
            <div className="flex flex-wrap items-center gap-3">
              {["Priya", "Arjun", "Fatima", "Ravi Kumar", "Meera", "Sanjay", "Aisha", "Kiran"].map((n, i) => (
                <Avatar key={n} name={n} size={48} turn={i === 2} />
              ))}
            </div>
            <p className="text-ink-muted mt-3 text-xs">
              Initials, never stock photos. The fill comes from the name, so a member keeps the same colour in every ring.
            </p>
          </div>
        </div>
      </Section>

      <Section id="type" chapter="Round 03 · Type" title="A soft serif with a clear sans" intro="Fraunces (with its soft axis turned up) for headlines, DM Sans for the interface. Script fonts from the Noto family download only when that language is shown.">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <p className="font-display text-6xl leading-none sm:text-7xl">Save together.</p>
            <p className="font-display text-4xl">Take turns.</p>
            <p className="font-display text-2xl">Your honesty, finally on record.</p>
            <p className="max-w-md">
              Body text is DM Sans at 16px with a 1.55 line height. It stays short and plain, one idea per sentence.
            </p>
            <p className="text-ink-muted max-w-md text-sm">Secondary text uses ink-muted and stays at AA contrast on every surface.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {SPECIMENS.map((s) => (
              <li key={s.lang} className="border-line bg-paper-raised rounded-2xl border p-4">
                <p className="text-ink-muted text-xs font-semibold">{s.name}</p>
                <p lang={s.lang} dir={s.dir} className={cn(scriptFontClass[s.script], "font-sans mt-1 text-lg leading-relaxed")}>
                  {s.text}
                </p>
              </li>
            ))}
            <li className="text-ink-muted text-xs">
              These are type specimens, not reviewed product copy. Product translations go through human review (see TRANSLATIONS_TODO.md, phase 5).
            </li>
          </ul>
        </div>
      </Section>

      <Section id="money" chapter="Round 04 · Money" title="Always their own currency" intro="Every amount goes through Intl.NumberFormat with tabular numerals. Rupees always use Indian grouping. Settlement is in a dollar stablecoin, but that name never appears on the main path.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="text-ink-muted text-xs font-semibold">Mumbai · INR</p>
            <Amount value={100000} currency="INR" size="lg" className="mt-2" />
          </Card>
          <Card>
            <p className="text-ink-muted text-xs font-semibold">Dubai · AED</p>
            <Amount value={367} currency="AED" size="lg" approxUsd={100} className="mt-2" />
          </Card>
          <Card>
            <p className="text-ink-muted text-xs font-semibold">London · GBP</p>
            <Amount value={420} currency="GBP" size="lg" approxUsd={530} className="mt-2" />
          </Card>
          <Card>
            <p className="text-ink-muted text-xs font-semibold">USD</p>
            <Amount value={1250.5} currency="USD" size="lg" className="mt-2" />
          </Card>
        </div>
        <Card tone="turn" className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge tone="turn" dot>
              Your turn
            </Badge>
            <p className="mt-3 text-sm font-semibold">You receive</p>
            <Amount value={2500000} currency="INR" size="xl" />
          </div>
          <p className="text-ink-muted text-sm">
              Tabular digits: <span className="tabular">{formatMoney(111111, "INR")}</span> sits exactly as wide as{" "}
            <span className="tabular">{formatMoney(888888, "INR")}</span>.
          </p>
        </Card>
      </Section>

      <Section id="components" chapter="Round 05 · Components" title="The kit" intro="One primary action per screen. Every touch target is at least 44px.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <p className="text-sm font-semibold">Button</p>
            <ButtonsDemo />
          </Card>
          <Card className="flex flex-col gap-4">
            <p className="text-sm font-semibold">Badge</p>
            <div className="flex flex-wrap gap-2">
              <Badge tone="turn" dot>Your turn</Badge>
              <Badge tone="trust">Turn Score 780</Badge>
              <Badge tone="success" dot>Paid</Badge>
              <Badge tone="warning" dot>Late · 1 day</Badge>
              <Badge tone="danger" dot>Missed</Badge>
              <Badge>Beta</Badge>
            </div>
          </Card>
          <Card className="flex flex-col gap-4">
            <p className="text-sm font-semibold">SegmentedControl</p>
            <SegmentedDemo />
          </Card>
          <Card className="flex flex-col gap-4">
            <p className="text-sm font-semibold">Stepper</p>
            <StepperDemo />
          </Card>
          <Card className="flex flex-col gap-4">
            <p className="text-sm font-semibold">Circle card (Card + ProgressRing + Amount)</p>
            <div className="border-line bg-paper flex items-center gap-4 rounded-2xl border p-4">
              <ProgressRing round={3} total={6} size={56} />
              <div className="min-w-0 flex-1">
                <p className="font-display truncate text-lg">Wedding fund</p>
                <p className="text-ink-muted text-sm">
                  Next payment: <Amount value={5000} currency="INR" size="sm" className="text-ink" /> on 12 Oct
                </p>
              </div>
              <Badge tone="success" dot>On track</Badge>
            </div>
          </Card>
          <Card className="flex flex-col gap-4">
            <p className="text-sm font-semibold">Stat (sample values)</p>
            <dl className="grid grid-cols-2 gap-6">
              <Stat label="circles running" value="12" source="Sample · not live" />
              <Stat label="on-time payments" value="98%" source="Sample · not live" />
              <Stat label="total saved" loading />
              <Stat label="average payout time" loading />
            </dl>
          </Card>
        </div>
      </Section>

      <Section id="feedback" chapter="Round 06 · Feedback" title="Calm states" intro="Skeletons rather than spinners. Every error carries a way to recover. Money actions say what happens next before you confirm.">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="flex flex-col gap-4">
            <p className="text-sm font-semibold">Sheet</p>
            <p className="text-ink-muted text-sm">A bottom sheet on phones and a dialog on desktop, built on native &lt;dialog&gt;.</p>
            <SheetDemo />
          </Card>
          <Card className="flex flex-col gap-4">
            <p className="text-sm font-semibold">Toast</p>
            <p className="text-ink-muted text-sm">Announced politely to screen readers. Toasts with an action stay up longer.</p>
            <ToastDemo />
          </Card>
          <Card className="flex flex-col gap-3" aria-busy>
            <p className="text-sm font-semibold">Skeleton</p>
            <div className="flex items-center gap-3">
              <Skeleton className="size-14 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-10 w-full rounded-pill" />
          </Card>
          <Card tone="sunk" className="lg:col-span-3">
            <EmptyState
              title="No circles yet"
              body="Start one with the people you already save with, or open an invite link someone sent you."
              action={<ButtonLink href="/design">Start a circle</ButtonLink>}
            />
          </Card>
        </div>
      </Section>

      <Section id="motion" chapter="Round 07 · Motion" title="Quick, purposeful, optional" intro="Transitions last 150 to 300 ms. The ring uses a gentle spring. Celebration is kept for one moment, your turn. With reduced motion on, the ring jumps instead of gliding, autoplay starts paused, and the loader holds still.">
        <dl className="grid gap-4 sm:grid-cols-4">
          {[
            ["--duration-fast", "150 ms", "Presses, hovers"],
            ["--duration-base", "220 ms", "Colour, state"],
            ["--duration-slow", "300 ms", "Sheets, toasts"],
            ["--ease-spring", "700 ms", "The ring marker"],
          ].map(([k, v, use]) => (
            <Card key={k} className="flex flex-col gap-1">
              <dt className="font-mono text-xs font-semibold">{k}</dt>
              <dd className="font-display text-2xl">{v}</dd>
              <dd className="text-ink-muted text-sm">{use}</dd>
            </Card>
          ))}
        </dl>
      </Section>
    </div>
  );
}
