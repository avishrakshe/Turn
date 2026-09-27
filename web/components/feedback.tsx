"use client";
// Asked once, after someone's first payout: 1–5 plus one open question. Answers feed docs/traction.md.
import { useState } from "react";
import { Button, Card } from "./ui";

const KEY = "turn.feedback.asked";

export function Feedback({ circle }: { circle: string }) {
  // Rendered client-side only (after the circle has loaded), so reading storage in the initializer is safe.
  const [show, setShow] = useState(() => {
    try {
      return !localStorage.getItem(KEY);
    } catch {
      return true;
    }
  });
  const [rating, setRating] = useState(0);
  const [answer, setAnswer] = useState("");
  const [sent, setSent] = useState(false);
  if (!show) return null;
  if (sent) return <Card className="text-center font-semibold">Thank you! 🙏</Card>;
  return (
    <Card className="flex flex-col gap-3 border-accent">
      <h2 className="font-extrabold">How was receiving your turn?</h2>
      <div className="flex justify-between" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={rating === n}
            onClick={() => setRating(n)}
            className={`h-12 w-12 rounded-2xl text-xl ${rating >= n ? "bg-accent-soft" : "bg-surface-2"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="What almost stopped you from using Turn?"
        className="min-h-20 rounded-2xl border border-line bg-bg p-3 text-sm"
      />
      <Button
        disabled={!rating}
        onClick={async () => {
          await fetch("/api/feedback", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rating, answer, circle }),
          }).catch(() => {});
          try {
            localStorage.setItem(KEY, "1");
          } catch {}
          setSent(true);
        }}
      >
        Send
      </Button>
      <button className="text-sm text-muted" onClick={() => setShow(false)}>
        Not now
      </button>
    </Card>
  );
}
