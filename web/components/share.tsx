"use client";
import { useState } from "react";
import { Button } from "./ui";

/** Invite sharing: WhatsApp first (that's where committees live), then Telegram, the native sheet, or copy. */
export function ShareInvite({ link, circleName, amount }: { link: string; circleName: string; amount: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Join "${circleName}" on Turn: ${amount} each round, and everyone takes a turn receiving the pot. Tap to join:`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  return (
    <div className="flex flex-col gap-3">
      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#25D366] px-5 font-bold text-white">
        Share on WhatsApp
      </a>
      <a href={tg} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#229ED9] px-5 font-bold text-white">
        Share on Telegram
      </a>
      <Button
        variant="secondary"
        onClick={async () => {
          if (navigator.share) {
            try {
              await navigator.share({ title: circleName, text, url: link });
              return;
            } catch {}
          }
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Link copied ✓" : "More ways to share"}
      </Button>
      <p className="break-all rounded-2xl bg-surface-2 p-3 font-mono text-xs text-muted" data-testid="invite-link">
        {link}
      </p>
    </div>
  );
}
