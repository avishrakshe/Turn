"use client";

import { TurnRing } from "@/components/ring/TurnRing";
import { useRingAutoplay } from "@/components/ring/useRingAutoplay";
import { Amount } from "@/components/ui/Amount";
import { ButtonLink } from "@/components/ui/Button";
import { APP_PATH, DESCRIPTION } from "@/lib/site";

const MEMBERS = ["Priya", "Arjun", "Fatima", "Ravi Kumar", "Meera", "Sanjay"].map((name) => ({ name }));
const CONTRIBUTION = 5000;

export function Hero() {
  const { step, paused, toggle } = useRingAutoplay(3200);
  const seat = step % MEMBERS.length;
  const current = MEMBERS[seat]!;

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-10 pb-20 sm:px-8 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pt-20 lg:pb-28">
        <div>
          <p className="chapter">A savings committee, kept safe</p>
          <h1 id="hero-title" className="mt-5 text-[3.4rem] leading-[0.98] sm:text-7xl lg:text-[5.4rem]">
            Save together.
            <br />
            <span className="text-teal-ink">Take turns.</span>
          </h1>
          <p className="text-ink-muted mt-6 max-w-md text-lg sm:text-xl">{DESCRIPTION}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={APP_PATH} size="lg">
              Start a circle
            </ButtonLink>
            <ButtonLink href="#how" size="lg" variant="outline">
              See how it works
            </ButtonLink>
          </div>
          <p className="text-ink-muted mt-6 text-sm">
            Face ID sign-in · Your own currency · No app to install
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[460px]">
          <div aria-hidden className="bg-marigold-soft absolute inset-[14%] -z-10 rounded-full opacity-70 blur-3xl" />
          <TurnRing
            members={MEMBERS}
            step={step}
            potFlow
            label={`A savings circle of ${MEMBERS.length}. Each month everyone puts in the same amount and one person receives the whole pot. This month it's ${current.name}'s turn.`}
            center={
              <>
                <span className="text-ink-muted text-[0.7rem] font-semibold tracking-[0.14em] uppercase sm:text-xs">This month&rsquo;s pot</span>
                <Amount value={CONTRIBUTION * MEMBERS.length} currency="INR" size="lg" className="mt-1" />
                <span className="text-marigold-ink mt-1 text-sm font-semibold" aria-hidden>
                  {current.name.split(" ")[0]}&rsquo;s turn
                </span>
              </>
            }
          />
          <button
            type="button"
            onClick={toggle}
            className="text-ink-muted hover:text-ink hover:bg-paper-sunk absolute end-0 bottom-0 inline-flex min-h-11 items-center gap-2 rounded-pill px-3 text-sm font-medium"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
              {paused ? <path d="M4 2.5v11l9-5.5z" fill="currentColor" /> : <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />}
            </svg>
            {paused ? "Play animation" : "Pause animation"}
          </button>
        </div>
      </div>
    </section>
  );
}
