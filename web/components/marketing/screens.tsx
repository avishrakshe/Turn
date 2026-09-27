import { ProgressRing } from "@/components/ring/ProgressRing";
import { TurnRing } from "@/components/ring/TurnRing";
import { Amount } from "@/components/ui/Amount";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { advance, commitBid, createCircle } from "@/lib/economics/engine";
import { ScreenHeader } from "./PhoneFrame";

// App screens for the landing page chapters, built from the real components. Money figures
// on the bid screen come from the economics engine, so they match what the circle would do.

const C = 5000;
const NAMES = ["You", "Arjun", "Fatima", "Ravi", "Meera"];

export function JoinScreen() {
  return (
    <>
      <ScreenHeader sub="Invite from Meera" title="Family Circle" />
      <div className="flex flex-1 flex-col gap-3 px-4">
        <div className="bg-paper-raised border-line rounded-2xl border p-4">
          <div className="flex -space-x-2 rtl:space-x-reverse">
            {NAMES.slice(1).map((n) => (
              <Avatar key={n} name={n} size={30} />
            ))}
          </div>
          <p className="mt-3 text-sm leading-snug">
            <span className="font-semibold">5 people</span> · <Amount value={C} currency="INR" size="sm" /> a month · 5 months
          </p>
          <p className="text-ink-muted mt-1 text-xs">You&rsquo;ll receive <Amount value={C * 5} currency="INR" size="sm" className="text-ink" /> once.</p>
        </div>
        <div className="text-ink-muted flex items-center gap-2 px-1 text-xs">
          <span className="bg-success size-1.5 rounded-full" /> Auto-pay on · you can turn it off any time
        </div>
      </div>
      {/* The passkey prompt, as the phone shows it */}
      <div className="bg-paper-raised shadow-lift m-3 mt-auto flex flex-col items-center gap-3 rounded-[1.6rem] p-5 text-center">
        <svg viewBox="0 0 48 48" className="text-teal size-14">
          <path d="M6 16V10a4 4 0 014-4h6M32 6h6a4 4 0 014 4v6M42 32v6a4 4 0 01-4 4h-6M16 42h-6a4 4 0 01-4-4v-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M17 18v3M31 18v3M24 19v8h-2M18 32c3.5 3 8.5 3 12 0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="font-semibold">Join with Face ID</p>
        <p className="text-ink-muted -mt-2 text-xs">No password. No app to install.</p>
        <Button className="w-full">Join and pay deposit</Button>
      </div>
    </>
  );
}

export function PayScreen() {
  return (
    <>
      <ScreenHeader sub="Fatima · Dubai" title="Your circles" />
      {/* Telegram reminder, as a notification banner */}
      <div className="bg-paper-raised shadow-soft border-line mx-3 mb-3 flex gap-3 rounded-2xl border p-3">
        <span className="bg-teal text-on-teal grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold">T</span>
        <div className="min-w-0 text-xs leading-snug">
          <p className="font-semibold">Turn · Telegram</p>
          <p className="text-ink-muted">Tomorrow: AED 220 for Family Circle is paid automatically.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-4">
        <div className="bg-paper-raised border-line flex items-center gap-3 rounded-2xl border p-3.5">
          <ProgressRing round={3} total={5} size={48} />
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-base">Family Circle</p>
            <p className="text-ink-muted text-xs">
              Next: <Amount value={220} currency="AED" size="sm" className="text-ink" /> · 12 Oct
            </p>
            <p className="text-success mt-0.5 text-[0.7rem] font-semibold">Auto-pay on</p>
          </div>
        </div>
        <div className="bg-paper-sunk rounded-2xl p-3.5 text-xs">
          <p className="text-ink-muted">Same circle, seen from Mumbai</p>
          <p className="mt-1 flex items-center gap-2">
            <Avatar name="Ravi" size={22} /> Ravi pays <Amount value={C} currency="INR" size="sm" />
          </p>
        </div>
        <div className="border-line flex items-center justify-between rounded-2xl border border-dashed p-3.5 text-xs">
          <span className="text-ink-muted">Last payment</span>
          <span className="text-success flex items-center gap-1.5 font-semibold">
            <svg viewBox="0 0 16 16" className="size-3.5"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Confirmed
          </span>
        </div>
      </div>
    </>
  );
}

function bidScenario() {
  let c = createCircle(
    { contribution: BigInt(C), mode: "AUCTION", maxDiscountBps: 3000, entryDeposit: BigInt(C), reserveBps: 2000 },
    NAMES.map((n) => ({ id: n, name: n })),
  );
  c = commitBid(c, "You", 400);
  c = commitBid(c, "Fatima", 300);
  const { events } = advance(c);
  const payout = events.find((e) => e.type === "PayoutMade")!;
  const closed = events.find((e) => e.type === "AuctionClosed")!;
  const credit = events.find((e) => e.type === "CreditAccrued");
  return { payout, closed, creditEach: credit ? Number(credit.amount) : 0 };
}

export function BidScreen() {
  const { payout, closed, creditEach } = bidScenario();
  const pot = Number(payout.pot);
  return (
    <>
      <ScreenHeader sub="Family Circle · Round 1" title="Sealed bids, revealed" />
      <div className="flex flex-1 flex-col gap-2.5 px-4">
        {closed.revealed.map((b, i) => (
          <div
            key={b.member}
            className={
              i === 0
                ? "bg-marigold-soft border-marigold/50 flex items-center gap-3 rounded-2xl border p-3"
                : "bg-paper-raised border-line flex items-center gap-3 rounded-2xl border p-3"
            }
          >
            <Avatar name={b.member} size={32} turn={i === 0} />
            <div className="flex-1 text-sm">
              <p className="font-semibold">{b.member}</p>
              <p className="text-ink-muted text-xs">offered a discount of</p>
            </div>
            <Amount value={(pot * b.bps) / 10000} currency="INR" size="sm" />
          </div>
        ))}
        {["Arjun", "Ravi", "Meera"].map((n) => (
          <div key={n} className="text-ink-muted flex items-center gap-3 px-3 text-xs">
            <Avatar name={n} size={24} /> {n} didn&rsquo;t bid
          </div>
        ))}
        <div className="bg-paper-raised border-line mt-auto mb-3 rounded-2xl border p-3.5 text-xs leading-relaxed">
          <Badge tone="turn" dot>Your turn</Badge>
          <p className="mt-2">
            You get <Amount value={Number(payout.netPaid)} currency="INR" size="sm" /> now. <Amount value={Number(payout.collateralWithheld)} currency="INR" size="sm" /> is kept as your safety deposit and comes back as you keep paying.
          </p>
          <p className="text-ink-muted mt-1">
            Each of the other 4 gets <Amount value={creditEach} currency="INR" size="sm" className="text-ink" /> off next month.
          </p>
        </div>
      </div>
    </>
  );
}

export function ProtectedScreen() {
  const members = NAMES.map((name) => ({ name, status: name === "Arjun" ? ("late" as const) : ("paid" as const) }));
  return (
    <>
      <ScreenHeader sub="Family Circle · March" title="Round 3 of 5" />
      <div className="px-8">
        <TurnRing
          members={members}
          step={2}
          showStatus
          label="Arjun missed March; everyone else paid."
          center={<Amount value={C * 5} currency="INR" size="md" />}
        />
      </div>
      <div className="bg-paper-raised border-line mx-3 mt-auto mb-3 rounded-2xl border p-3.5 text-xs leading-relaxed">
        <div className="flex items-center gap-2">
          <Badge tone="warning" dot>Arjun missed March</Badge>
        </div>
        <p className="mt-2">
          The safety deposit held from Arjun&rsquo;s payout covered it. The pot is still <Amount value={C * 5} currency="INR" size="sm" />.
        </p>
        <p className="text-success mt-1 font-semibold">You&rsquo;re not affected.</p>
      </div>
    </>
  );
}
