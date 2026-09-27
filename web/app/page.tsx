import Link from "next/link";

const steps = [
  { icon: "👨‍👩‍👧", title: "Start a circle", body: "Pick an amount and how often. Share the link on WhatsApp with family, wherever they live." },
  { icon: "🔁", title: "Everyone pays in automatically", body: "Each round, contributions are collected for you. No chasing, no notebooks." },
  { icon: "🎉", title: "Take your turn", body: "Each round one person receives the whole pot. Need it sooner? Offer a small discount." },
];

const promises = [
  { title: "No one can run off with the money", body: "There's no organizer holding the pot. Turn's rules pay out on time, every time." },
  { title: "Missed payments are covered", body: "Deposits and a shared safety fund cover a late payer, so you still get your full turn." },
  { title: "No organizer's cut", body: "Keep the 3–5% an organizer usually takes. Discounts go back to the members." },
  { title: "Build a savings record", body: "Every on-time payment builds your record. Good savers put down less next time." },
];

export default function Landing() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-12">
      <header className="flex items-center justify-between py-5">
        <span className="text-2xl font-extrabold tracking-tight">
          Turn<span className="text-accent">.</span>
        </span>
        <Link href="/home" className="text-sm font-semibold text-primary">
          Open
        </Link>
      </header>

      <section className="mt-6 flex flex-col gap-5">
        <span className="w-fit rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-warn">Beta · for families in India & the Gulf</span>
        <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-tight">
          Save together.
          <br />
          <span className="text-primary">Take turns.</span>
        </h1>
        <p className="text-lg text-muted">
          Your family committee, without the notebook. Everyone pays in each month, one person receives the pot, and it all
          runs by itself, even across countries.
        </p>
        <Link
          href="/start"
          className="mt-2 inline-flex min-h-14 items-center justify-center rounded-2xl bg-primary px-6 text-lg font-bold text-primary-ink shadow-sm"
        >
          Start saving with your family
        </Link>
        <p className="text-center text-sm text-muted">Sign up with Face ID. No passwords, no forms.</p>
      </section>

      <section className="mt-12 flex flex-col gap-3">
        {steps.map((s, i) => (
          <div key={s.title} className="flex gap-4 rounded-3xl border border-line bg-surface p-5">
            <span className="text-3xl" aria-hidden>
              {s.icon}
            </span>
            <div>
              <p className="text-xs font-bold text-muted">STEP {i + 1}</p>
              <h2 className="font-bold">{s.title}</h2>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">Why families switch to Turn</h2>
        <div className="mt-4 grid gap-3">
          {promises.map((p) => (
            <div key={p.title} className="rounded-3xl bg-primary-soft p-5">
              <h3 className="font-bold text-primary">{p.title}</h3>
              <p className="mt-1 text-sm text-ink/80">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-3xl bg-surface-2 p-5 text-sm text-muted">
        <p>
          Amounts show in your own currency (₹, AED, £ and more). Money is held as US dollars underneath, so a circle between
          Dubai and Kochi settles instantly, with no transfer fees eating into your savings.
        </p>
      </section>

      <Link href="/stats" className="mt-8 text-center text-sm font-semibold text-primary">
        See Turn's live numbers →
      </Link>
    </div>
  );
}
