# Turn — UI decisions

Why the interface looks and behaves the way it does. Updated at the end of each UI phase.

## Phase 1 — Design system

**The ring is the brand.** A committee is people sitting in a circle, taking turns. So one motif does
every job: the hero animation (`TurnRing`), circle progress in the app (`ProgressRing`, one segment per
round), the loading state (`RingLoader`, a light passing seat to seat), and the logo (six seats, one lit
at 2 o'clock, so the static mark still looks like it's moving).

**The marker only moves forward.** `TurnRing` takes a step counter that only increases, so going from the
last seat back to the first continues clockwise instead of spinning back. A turn never goes backwards,
and the animation shouldn't either.

**Colour is rationed.**
- Warm paper and warm ink, never pure white or black, so it reads as a family ledger rather than a trading screen.
- Marigold is reserved for the primary action and the "your turn" moment, so the moment stays special.
- Teal carries trust and money.
- Every text/background pair is checked for WCAG AA in both themes by `pnpm --filter @turn/site contrast`,
  which exits non-zero on any failure (it will be wired into CI in phase 5).

**Type.**
- Fraunces with its SOFT axis turned up gives warm, rounded headlines.
- DM Sans is used for the interface because it has true tabular figures, so amounts line up.
- Noto script fonts (Devanagari, Malayalam, Tamil, Naskh for Urdu) are never preloaded, so English visitors
  don't download them. Naskh was chosen over Nastaliq for legibility at UI sizes.

**Money is local.**
- `Intl.NumberFormat` everywhere. INR always uses Indian grouping (₹1,00,000), even for an English UI.
- Amounts are isolated left-to-right, so "₹25,000" keeps its shape inside Urdu (RTL) sentences.
- The settlement stablecoin never appears on the main path.

**Calm, accessible components.**
- Every touch target is at least 44 px.
- The sheet is built on native `<dialog>`, which gives a free focus trap, Escape to close and an inert background.
- The segmented control is a real radio group, with arrow keys mirrored in RTL.
- Toasts use one polite live region, and a toast with a recovery action stays up for 10 s.
- Skeletons replace spinners for content.
- With reduced motion on, the ring jumps instead of gliding, autoplay starts paused, the pot animation is
  skipped, and the loader holds still. Autoplay always has a visible pause control (WCAG 2.2.2).

**No stock photos of people.** Members are shown as initials on warm fills. The colour comes from the
name, so a member keeps the same colour in every ring.

## Phase 2 — Marketing site

**Chapters run like a circle.** Every section carries a round counter ("ROUND 03 · YOUR TURN"),
so the page itself progresses the way a circle does. On desktop, a sticky phone switches between real
app screens as each chapter reaches the middle of the viewport. On phones, each chapter shows its screen
inline. The phones are illustrations: `aria-hidden` and `inert`, so the text carries the meaning and
keyboard users never tab into a fake app.

**The simulation runs the real rules.**
- "Run a circle in 30 seconds" runs `site/lib/economics`, a TypeScript port of the circle economics in
  `plan.md` §3.3–3.4.
- The port is checked against `plan.md`'s worked ejection example and against 400 randomized circles,
  asserting the invariants after every step.
- `vectors.json` holds the shared test vectors the Solidity tests should reuse.
- The plain-language explanations are generated from the engine's events and have their own tests.

**Honest by construction.**
- Live stats come only from the indexer and are labelled with their network. With no indexer, the
  section says so instead of showing a number.
- The Turn Score example uses the real formula and says "Example card, not a real person".
- There are no testimonials, because there are no pilot users yet.
- The FAQ says "unaudited" and "check local rules", and it names the stablecoin.

**Early winners see the real payout.** The bid screen shows "₹9,000 now, ₹15,000 kept as your safety
deposit" instead of implying the whole pot lands at once. That's how the safety rules work, and a
member who hears it up front won't feel cheated later.

**Script fonts stay off the landing page** until someone picks that language in the reminder preview.
The language tab labels use system fonts, which cover every script.

## Phase 3 — Docs

**Custom MDX, not a docs framework.** Fumadocs supports Next 16, but it pulls in a second bundler
toolchain, and its UI would have fought the design system. `@next/mdx` with a small layout (sidebar,
"on this page", search) keeps the docs visibly part of Turn.

**Two layers on every page.** An "In plain words" card comes first, in 3–5 sentences a member can
follow. After an "Under the hood" divider come contracts, functions, events, formulas and diagrams. A
family member and a judge can both stop reading at the point where they have what they need.

**Honesty is structural.**
- Every page carries a "beta, unaudited, being built" line.
- Contract addresses come only from `contracts/deployments/*.json`.
- Source links render only if the file exists in the repo; otherwise they say "not published yet".
- Limitations get their own callout style, so they're easy to spot rather than buried.

**Diagrams stay readable.** Mermaid loads only when a diagram scrolls near view, draws in the site's
tokens, and redraws when the theme changes. Diagrams render at their natural size and scroll sideways
rather than shrink to unreadable text. Each one has a "Diagram as text" fallback.

**A reduced-motion bug, found by the docs.** The global reduced-motion rule set every transition to
0.01ms. Because `transition-property` defaults to `all`, that made every style change on the page
animate for a moment, and Mermaid measured stale layout, blowing diagrams up to 7× their size. It's now
`0s`, which fixes the whole site, not just diagrams.

**Onchain, precisely.** A dedicated page (`/docs/onchain`) lists what is and isn't on the chain and
why. It covers every user action as a transaction (Face ID, signer, submitter and payer, contract calls,
events), a month end to end, the anatomy of a signed batch, and which Monad facts the design leans on.
It's the page to hand a judge who asks "what does the blockchain actually do here?".

**Search without a service.** A static JSON index (one entry per section) is built at build time and
fetched only when search opens (`/` or Ctrl/⌘ K). The search is keyboard-first, with results that
jump straight to the right heading.

## Phase 4 — App

**Built against one store, running in demo mode for now.** The contracts, relayer and indexer don't
exist yet, so every screen reads and writes through `lib/app/store.ts`. Today that store runs the
tested economics engine in the browser. The live version swaps in chain reads and relayer writes behind
the same actions. Every screen says "Demo" in the header, a line under it says "No real money, nothing
on-chain yet", and Face ID prompts say "Demo: no passkey is created".

**Onboarding counts taps.** Joining by invite is two taps and one Face ID prompt: "Join with Face ID",
then "Use Face ID". Language and currency are pre-filled on the first screen (currency from the time
zone), and each is one tap to change. `/metrics` shows the measured time and taps from first opening
the app to the first confirmation.

**One primary action per screen.**
- A circle that's forming offers "Share invite".
- An auction circle offers "Bid for this month's pot".
- A fixed-order circle offers "Swap turns".
- Everything else is information: next payment, what's held for your safety and when it comes back,
  and credit off your next payment.

**Money actions say what happens next, then give a receipt.**
- Before confirming: "You pay a ₹5,000 deposit now. It covers you if you ever miss a month, and comes back at the end."
- After: "Confirmed · …", with the transaction behind "Details", never on the main screen.
- The bid sheet shows exactly what a win pays out now, what's held back, and what each other member gets.
- The swap sheet shows how the held-back amount changes before either person agrees, because collateral follows the seat.

**The reveal is a moment.** When bidding closes, sealed bids open one by one, then the winner. The one
celebration (confetti and a bloom) is for "your turn". Missed payments are shown calmly: "Meera missed a
payment. Their joining deposit covered it. You're not affected."

**The ring never lies.** In auction circles, nobody's turn is decided while bidding is open, so the ring
shows no marker. In fixed-order circles it marks whose turn it is. The marker only moves forward.

**Translation-ready from the first line.** Every app string lives in `lib/i18n/en.ts`, with plurals and
interpolation. Phase 5 adds the other languages as files, and RTL is already wired: the app sets
`lang` and `dir` on the document.