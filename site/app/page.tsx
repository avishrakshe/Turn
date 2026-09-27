import type { Metadata } from "next";
import { type Chapter, Chapters } from "@/components/marketing/Chapters";
import { Corridors } from "@/components/marketing/Corridors";
import { Faq } from "@/components/marketing/Faq";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Footer } from "@/components/marketing/Footer";
import { Hero } from "@/components/marketing/Hero";
import { Languages } from "@/components/marketing/Languages";
import { LiveStats } from "@/components/marketing/LiveStats";
import { Nav } from "@/components/marketing/Nav";
import { Safety } from "@/components/marketing/Safety";
import { BidScreen, JoinScreen, PayScreen, ProtectedScreen } from "@/components/marketing/screens";
import { Section } from "@/components/marketing/Section";
import { Simulation } from "@/components/marketing/Simulation";
import { TurnScore } from "@/components/marketing/TurnScore";
import { Amount } from "@/components/ui/Amount";
import { DESCRIPTION, TAGLINE } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `Turn · ${TAGLINE}` },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
};

// Live stats are cached for a minute; the rest of the page is static.
export const revalidate = 60;

const CHAPTERS: Chapter[] = [
  {
    id: "join",
    label: "Join",
    title: "Join with your face, not a password.",
    body: (
      <>
        <p>Open the invite link, look at your phone, and you&rsquo;re in. One Face ID prompt creates your account and joins the circle.</p>
        <p>There&rsquo;s no app store download, no password, and no twelve secret words to write down.</p>
      </>
    ),
    screen: <JoinScreen />,
  },
  {
    id: "pay",
    label: "Pay",
    title: "Auto-pay, in your own currency.",
    body: (
      <>
        <p>
          Fatima in Dubai sees <Amount value={220} currency="AED" className="text-ink" />. Ravi in Mumbai sees{" "}
          <Amount value={5000} currency="INR" className="text-ink" />. It&rsquo;s the same circle and the same share, each in their own money.
        </p>
        <p>Payments go out automatically each month, and a reminder arrives on Telegram the day before, in your language.</p>
      </>
    ),
    screen: <PayScreen />,
  },
  {
    id: "your-turn",
    label: "Your turn",
    title: "Need it sooner? Bid for it.",
    body: (
      <>
        <p>
          If you need the money early, for a wedding, school fees or stock for the shop, offer a small discount. Bids stay sealed until
          bidding closes, so nobody can outbid you by a rupee at the last second.
        </p>
        <p>The biggest discount wins the pot, and the discount is shared with everyone else in the circle.</p>
      </>
    ),
    screen: <BidScreen />,
  },
  {
    id: "protected",
    label: "Protected",
    title: "If someone stops paying, you don’t lose.",
    body: (
      <>
        <p>Whoever takes the pot early leaves part of it behind as a safety deposit. If they miss a month, that deposit pays in for them, automatically.</p>
        <p>The pot stays full, everyone else is paid as promised, and nobody has to chase anyone for money.</p>
      </>
    ),
    screen: <ProtectedScreen />,
  },
];

export default function Home() {
  return (
    <>
      <a href="#main" className="bg-ink text-paper sr-only z-50 rounded-lg px-4 py-3 font-semibold focus:not-sr-only focus:fixed focus:start-3 focus:top-3">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Chapters chapters={CHAPTERS} />
        <LiveStats />
        <Section
          id="demo"
          round={6}
          label="Try it"
          title="Run a circle in 30 seconds"
          intro="Play out a whole circle here, with no sign-up. Bid for your turn, or see what happens when Arjun misses a payment. The numbers come from the same rules the real circles run on."
          className="bg-paper-sunk"
        >
          <Simulation />
        </Section>
        <Corridors />
        <Safety />
        <TurnScore />
        <Section
          id="language"
          round={10}
          label="Your language"
          title="Reminders the whole family can read"
          intro="English, Hindi, Malayalam, Tamil and Urdu, each with amounts in the currency the member actually uses."
        >
          <Languages />
        </Section>
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
