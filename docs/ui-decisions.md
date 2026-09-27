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
- Every text/background pair is checked for WCAG AA in both themes by `pnpm --filter @turn/web contrast`,
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
- "Run a circle in 30 seconds" runs `web/lib/economics`, a TypeScript port of the circle economics in
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
