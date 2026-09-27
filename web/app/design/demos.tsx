"use client";

import { useState } from "react";
import { TurnRing, type RingMember, type SeatStatus } from "@/components/ring/TurnRing";
import { useRingAutoplay } from "@/components/ring/useRingAutoplay";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { Stepper } from "@/components/ui/Stepper";
import { ToastProvider, useToast } from "@/components/ui/Toast";

const NAMES = ["Priya", "Arjun", "Fatima", "Ravi Kumar", "Meera", "Sanjay", "Aisha", "Kiran", "Deepa", "Imran", "Lakshmi", "Yusuf"];
const STATUSES: SeatStatus[] = ["paid", "paid", "pending", "paid", "late", "paid", "pending", "paid", "paid", "paid", "pending", "paid"];

export function RingPlayground() {
  const [size, setSize] = useState<"5" | "6" | "8" | "12">("6");
  const [mode, setMode] = useState<"hero" | "status">("hero");
  const { step, paused, toggle, next } = useRingAutoplay(3200);
  const n = Number(size);
  const members: RingMember[] = NAMES.slice(0, n).map((name, i) => ({ name, status: STATUSES[i] }));
  const current = members[step % n];
  const round = (step % n) + 1;

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
      <TurnRing
        members={members}
        step={step}
        potFlow={mode === "hero"}
        showStatus={mode === "status"}
        center={
          <>
            <span className="text-ink-muted text-xs font-semibold tracking-[0.14em] uppercase">
              Round {round} of {n}
            </span>
            <Amount value={5000 * n} currency="INR" size="lg" className="mt-1" />
            <span className="text-marigold-ink mt-1 text-sm font-semibold">{current?.name}&rsquo;s turn</span>
          </>
        }
        className="mx-auto max-w-[420px]"
      />
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-ink-muted text-sm font-semibold">Members</span>
          <SegmentedControl label="Members" value={size} onChange={setSize} options={["5", "6", "8", "12"].map((v) => ({ value: v as typeof size, label: v }))} />
        </div>
        <SegmentedControl
          label="Ring mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "hero", label: "Pot flow" },
            { value: "status", label: "Payment status" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={next}>
            Next month
          </Button>
          <Button variant="ghost" onClick={toggle}>
            {paused ? "Play" : "Pause"}
          </Button>
        </div>
        <p className="text-ink-muted max-w-sm text-sm">
          The marker springs forward one seat each round. It never runs backwards, even when it wraps
          from the last seat to the first. Autoplay starts paused when the viewer prefers reduced motion,
          and it pauses while the tab is hidden.
        </p>
        {mode === "status" && (
          <ul className="text-ink-muted flex flex-wrap gap-4 text-sm">
            <li className="flex items-center gap-2"><span className="bg-success size-3 rounded-full" />Paid</li>
            <li className="flex items-center gap-2"><span className="border-ink-faint size-3 rounded-full border-2" />Not paid yet</li>
            <li className="flex items-center gap-2"><span className="bg-warning size-3 rounded-full" />Late</li>
          </ul>
        )}
      </div>
    </div>
  );
}

export function ButtonsDemo() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        busy={busy}
        onClick={() => {
          setBusy(true);
          window.setTimeout(() => setBusy(false), 1400);
        }}
      >
        {busy ? "Paying" : "Pay ₹5,000"}
      </Button>
      <Button variant="secondary">Join circle</Button>
      <Button variant="outline">See how it works</Button>
      <Button variant="ghost">Details</Button>
      <Button size="lg">Start a circle</Button>
      <Button disabled>Disabled</Button>
    </div>
  );
}

export function SegmentedDemo() {
  const [v, setV] = useState<"order" | "bid">("order");
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        label="How turns are decided"
        value={v}
        onChange={setV}
        options={[
          { value: "order", label: "Take turns in order" },
          { value: "bid", label: "Bid for turns" },
        ]}
      />
      <p className="text-ink-muted text-sm">
        {v === "order"
          ? "Everyone gets the pot once, in the order you set."
          : "Anyone who needs it sooner can offer a discount. The discount is shared with everyone else."}
      </p>
    </div>
  );
}

const STEPS = ["Template", "Amount", "Turns", "Review"];

export function StepperDemo() {
  const [i, setI] = useState(1);
  return (
    <div className="flex flex-col gap-4">
      <Stepper steps={STEPS} current={i} label="Create a circle" />
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>
          Back
        </Button>
        <Button variant="secondary" onClick={() => setI((x) => Math.min(STEPS.length - 1, x + 1))} disabled={i === STEPS.length - 1}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open payment sheet
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Pay this month"
        description="₹5,000 goes into the circle's pot. Meera receives it on 12 Oct."
        footer={
          <>
            <Button size="lg" onClick={() => setOpen(false)}>
              Pay ₹5,000 with Face ID
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Not now
            </Button>
          </>
        }
      >
        <dl className="divide-line grid divide-y text-sm">
          <div className="flex justify-between py-3">
            <dt className="text-ink-muted">Circle</dt>
            <dd className="font-semibold">Wedding fund</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-ink-muted">Round</dt>
            <dd className="tabular font-semibold">4 of 6</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-ink-muted">Amount</dt>
            <dd><Amount value={5000} currency="INR" approxUsd={60} /></dd>
          </div>
        </dl>
      </Sheet>
    </>
  );
}

function ToastButtons() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => toast({ tone: "success", title: "Paid · Confirmed", description: "₹5,000 is in the pot for October." })}>
        Success toast
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast({
            tone: "danger",
            title: "Payment didn't go through",
            description: "You have 2 days left.",
            action: { label: "Try again", onClick: () => toast({ tone: "success", title: "Paid · Confirmed" }) },
          })
        }
      >
        Error toast with recovery
      </Button>
    </div>
  );
}

export function ToastDemo() {
  return (
    <ToastProvider>
      <ToastButtons />
    </ToastProvider>
  );
}
