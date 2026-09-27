import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Hero3D } from "@/components/site/hero";
import { TurnWheel } from "@/components/wheel";
import { CURRENCIES } from "@/lib/money";

export const metadata: Metadata = {
  title: { absolute: "Turn — Save together. Take turns." },
};

const steps: { icon: IconName; title: string; body: string }[] = [
  { icon: "users", title: "Start a circle", body: "Pick an amount and how often. Share one link on WhatsApp with family, wherever they live." },
  { icon: "repeat", title: "Everyone pays in, automatically", body: "Each round, contributions are collected for you. No chasing, no notebook, no awkward reminders." },
  { icon: "gift", title: "Take your turn", body: "Each round one person receives the whole pot. Need it sooner? Offer a small discount that goes to everyone else." },
];

const promises: { icon: IconName; title: string; body: string; wide?: boolean }[] = [
  {
    icon: "lock",
    title: "Nobody can run off with the money",
    body: "There's no organizer holding the pot. Turn's rules pay out on time, every round, and no one, not even us, can take it.",
    wide: true,
  },
  { icon: "shield", title: "Missed payments are covered", body: "Deposits and a shared safety fund cover a late payer, so you still get your full turn." },
  { icon: "sparkle", title: "No organizer's cut", body: "Keep the 3–5% an organizer usually takes. Discounts go back to the members." },
  { icon: "star", title: "Build a savings record", body: "Every on-time payment builds your record. Good savers put down less next time." },
  {
    icon: "globe",
    title: "One circle, many countries",
    body: "Amounts show in ₹, AED, £ and more. Money moves as US dollars underneath, so Dubai to Kochi settles instantly with no transfer fees.",
    wide: true,
  },
];

const compare = [
  ["Who holds the money", "The organizer", "Nobody. Rules in code"],
  ["If someone doesn't pay", "Arguments", "Deposit + safety fund cover it"],
  ["Organizer's cut", "3–5%", "0%"],
  ["Reminders & collection", "Phone calls", "Automatic"],
  ["Family abroad", "Wire fees, delays", "Instant, no fees"],
];

const tech: { name: string; what: string; icon: IconName }[] = [
  { name: "Passkeys", what: "Face ID is your wallet. One passkey, many keys: account, private names, invites", icon: "face" },
  { name: "Gasless", what: "EIP-7702 smart accounts; we pay the network fees", icon: "bolt" },
  { name: "Monad", what: "Fast, cheap settlement for every round", icon: "repeat" },
  { name: "Chainlink CRE", what: "Rounds collect and pay out on schedule", icon: "clock" },
  { name: "Envio", what: "Your circles and history load instantly, on any device", icon: "chart" },
  { name: "AUSD", what: "Held as digital US dollars, shown in your currency", icon: "wallet" },
];

const faqs = [
  {
    q: "Is this like our family committee / chit fund / kameti?",
    a: "Exactly that. Everyone puts in the same amount each round and one person receives the pot, until everyone has had a turn. Turn just does the collecting, the record-keeping and the paying out.",
  },
  {
    q: "What if someone stops paying?",
    a: "Everyone puts down a small deposit when they join, and a shared safety fund builds up. If someone misses a payment it's covered, and people who keep missing are removed and settled fairly. Everyone else still receives their full turn.",
  },
  {
    q: "Do I need a crypto wallet or seed phrase?",
    a: "No. You sign up with Face ID or your fingerprint. Your passkey syncs with your phone's account, so a new phone just works. There are no fees to pay and nothing to install.",
  },
  {
    q: "Who decides who gets the pot?",
    a: "You choose when you create the circle: take turns in the order people join, or let members offer a small discount to receive earlier. The discount is shared with everyone who waits.",
  },
  { q: "Is it live?", a: "Turn is in beta on Monad's test network with test dollars, so you can try a real circle with family today at no cost." },
];

function Section({ id, eyebrow, title, children, className = "" }: { id?: string; eyebrow: string; title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20 md:py-28 ${className}`}>
      <p className="reveal text-xs font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h2 className="reveal mt-3 max-w-2xl font-display text-[34px] font-extrabold leading-[1.05] tracking-tight md:text-5xl">{title}</h2>
      <div className="mt-12">{children}</div>
    </section>
  );
}

function OpenApp({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <Link
      href="/home"
      className={`group inline-flex items-center justify-center gap-2 rounded-full bg-accent font-bold text-[#2a1a05] shadow-[0_12px_40px_-12px_#f2a541] transition hover:brightness-105 active:scale-[0.98] ${
        size === "lg" ? "min-h-14 px-8 text-lg" : "min-h-11 px-5 text-sm"
      }`}
    >
      Open the app
      <Icon name="chevron" size={size === "lg" ? 20 : 16} strokeWidth={2.6} className="transition group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function Landing() {
  const loop = [...CURRENCIES, ...CURRENCIES];
  return (
    <div className="site min-h-dvh overflow-x-hidden">
      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-[#06120f]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            </span>
            Turn<span className="text-accent">.</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-muted md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#safety" className="hover:text-ink">Safety</a>
            <a href="#tech" className="hover:text-ink">Technology</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
          </nav>
          <OpenApp />
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-[100svh] pt-16">
        <div className="site-glow pointer-events-none absolute inset-0" />
        <div className="site-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl items-center gap-4 px-5 md:grid-cols-[1.05fr_1fr]">
          <div className="relative z-10 flex flex-col gap-6 pt-8 md:pt-0">
            <span className="rise inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-primary" /> Beta · live on Monad testnet
            </span>
            <h1 className="rise-2 font-display text-[52px] font-extrabold leading-[0.95] tracking-tight md:text-[64px] xl:text-[80px]">
              Save together.
              <br />
              <span className="text-gradient">Take turns.</span>
            </h1>
            <p className="rise-3 max-w-md text-lg text-muted md:text-xl">
              Your family committee, without the notebook. Everyone pays in each month, one person receives the pot, and it all runs by itself, even across countries.
            </p>
            <div className="rise-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <OpenApp size="lg" />
              <Link
                href="/start"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/15 px-7 text-base font-bold transition hover:bg-white/5"
              >
                Start saving with your family
              </Link>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              {[
                ["face", "Sign up with Face ID"],
                ["bolt", "No fees"],
                ["globe", "Your own currency"],
              ].map(([i, t]) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Icon name={i as IconName} size={16} className="text-primary" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative -mx-5 h-[420px] md:mx-0 md:h-[620px]">
            <Hero3D />
            <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-white/10 bg-[#06120f]/70 px-4 py-2 text-xs font-semibold text-muted backdrop-blur md:bottom-16">
              <span className="h-2 w-2 rounded-full bg-[#9fe3d0]" /> everyone pays in
              <span className="h-2 w-2 rounded-full bg-accent" /> one person receives
            </div>
          </div>
        </div>
      </section>

      {/* Currencies marquee */}
      <div className="border-y border-white/5 py-5" aria-label="Currencies">
        <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)]">
          <div className="marquee flex shrink-0 gap-10 pr-10">
            {loop.map((c, i) => (
              <span key={i} className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-muted">
                <span className="text-xl">{c.flag}</span> {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <Section id="how" eyebrow="How it works" title={<>Three steps. Then it runs by itself.</>}>
        <div className="grid items-center gap-12 md:grid-cols-2">
          <ol className="flex flex-col gap-4">
            {steps.map((s, i) => (
              <li key={s.title} className="reveal flex gap-5 rounded-[28px] border border-line bg-surface p-6">
                <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <Icon name={s.icon} size={26} />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-[#2a1a05]">{i + 1}</span>
                </span>
                <div>
                  <h3 className="text-lg font-extrabold">{s.title}</h3>
                  <p className="mt-1 text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* Phone mockup: an illustration of the circle screen */}
          <div className="reveal relative mx-auto w-[300px]">
            <div className="absolute -inset-10 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative rounded-[48px] border-[10px] border-[#1d2b27] bg-[#0b1714] p-4 shadow-2xl">
              <div className="mx-auto mb-3 h-5 w-24 rounded-full bg-[#1d2b27]" />
              <p className="text-center text-sm font-bold">Family circle</p>
              <p className="mb-2 text-center text-[11px] font-semibold text-primary">● Round 3 of 6</p>
              <TurnWheel
                size={240}
                progress={2 / 6}
                current="0x0000000000000000000000000000000000000003"
                members={[
                  { address: "0x1111111111111111111111111111111111111111", name: "Mom", received: true, me: false },
                  { address: "0x2222222222222222222222222222222222222222", name: "Ravi", received: true, me: false },
                  { address: "0x0000000000000000000000000000000000000003", name: "Meera", received: false, me: false },
                  { address: "0x4444444444444444444444444444444444444444", name: "", received: false, me: true },
                  { address: "0x5555555555555555555555555555555555555555", name: "Anil", received: false, me: false },
                  { address: "0x6666666666666666666666666666666666666666", name: "Sara", received: false, me: false },
                ]}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted">This round&apos;s pot</span>
                <span className="font-display text-2xl font-extrabold">₹30,000</span>
                <span className="text-[11px] text-muted">6 of 6 paid</span>
              </TurnWheel>
              <div className="mt-3 rounded-2xl bg-surface-2 p-3 text-xs">
                <p className="font-bold">Your turn is coming</p>
                <p className="text-muted">This round: <span className="font-bold text-good">Paid ✓</span></p>
              </div>
              <p className="mt-3 text-center text-[10px] text-muted">Illustration</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Promises bento */}
      <Section id="safety" eyebrow="Why families switch" title={<>All the trust of a family committee. <span className="text-muted">None of the stress.</span></>}>
        <div className="grid gap-4 md:grid-cols-3">
          {promises.map((p) => (
            <div
              key={p.title}
              className={`reveal group relative overflow-hidden rounded-[28px] border border-line bg-surface p-7 transition hover:border-primary/40 ${p.wide ? "md:col-span-2" : ""}`}
            >
              <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full border-[14px] border-primary/5 transition group-hover:border-primary/10" />
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Icon name={p.icon} size={24} />
              </span>
              <h3 className="mt-5 text-xl font-extrabold">{p.title}</h3>
              <p className="mt-2 max-w-lg text-muted">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="reveal mt-16 overflow-hidden rounded-[28px] border border-line">
          <div className="grid grid-cols-[1.2fr_1fr_1fr] bg-surface-2 px-5 py-4 text-xs font-bold uppercase tracking-wider text-muted md:px-8">
            <span />
            <span>The old way</span>
            <span className="text-primary">With Turn</span>
          </div>
          {compare.map(([k, old, now]) => (
            <div key={k} className="grid grid-cols-[1.2fr_1fr_1fr] items-center gap-2 border-t border-line bg-surface px-5 py-4 text-sm md:px-8 md:text-base">
              <span className="font-semibold">{k}</span>
              <span className="text-muted">{old}</span>
              <span className="flex items-center gap-2 font-bold">
                <Icon name="check" size={16} strokeWidth={3} className="hidden shrink-0 text-primary sm:block" />
                {now}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Technology */}
      <Section id="tech" eyebrow="Under the hood" title={<>Bank-grade plumbing you never have to see.</>}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tech.map((t) => (
            <div key={t.name} className="reveal flex gap-4 rounded-[24px] border border-line bg-surface/60 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-accent">
                <Icon name={t.icon} size={21} />
              </span>
              <div>
                <h3 className="font-extrabold">{t.name}</h3>
                <p className="mt-0.5 text-sm text-muted">{t.what}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted">
          Open source.{" "}
          <Link href="/stats" className="font-semibold text-primary hover:underline">
            See Turn&apos;s live numbers →
          </Link>
        </p>
      </Section>

      {/* FAQ */}
      <Section id="faq" eyebrow="Questions" title="Good questions, straight answers.">
        <div className="flex max-w-3xl flex-col gap-3">
          {faqs.map((f) => (
            <details key={f.q} className="reveal group rounded-[22px] border border-line bg-surface px-6 py-5 open:border-primary/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold">
                {f.q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 transition group-open:rotate-45">
                  <Icon name="plus" size={16} strokeWidth={2.6} />
                </span>
              </summary>
              <p className="mt-3 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="reveal relative overflow-hidden rounded-[40px] bg-gradient-to-br from-[#17594a] to-[#0a2c24] px-6 py-16 text-center md:py-24">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full border-[28px] border-white/5" />
          <div className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full border-[36px] border-[#f2a541]/10" />
          <h2 className="relative font-display text-4xl font-extrabold tracking-tight md:text-6xl">
            Your turn is coming.
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-lg text-white/75">Start a circle in under a minute. Invite family with one link.</p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <OpenApp size="lg" />
            <Link href="/start" className="inline-flex min-h-14 items-center rounded-full px-6 font-bold text-white/90 hover:text-white">
              Create an account
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted md:flex-row">
          <span className="font-display text-lg font-extrabold text-ink">
            Turn<span className="text-accent">.</span> <span className="text-sm font-medium text-muted">Save together. Take turns.</span>
          </span>
          <div className="flex gap-6">
            <Link href="/home" className="hover:text-ink">App</Link>
            <Link href="/stats" className="hover:text-ink">Live stats</Link>
            <a href="https://github.com/avishrakshe/Turn" target="_blank" rel="noreferrer" className="hover:text-ink">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
