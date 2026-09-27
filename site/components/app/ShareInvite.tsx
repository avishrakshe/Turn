"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useMoney, useStore } from "@/lib/app/hooks";
import { encodeInvite, inviteUrl } from "@/lib/app/invite";
import { type CircleRec, store } from "@/lib/app/store";
import { useT } from "@/lib/i18n";

/** Invite panel while a circle is forming: copy, WhatsApp, and (demo) fill the seats. */
export function ShareInvite({ circle: c }: { circle: CircleRec }) {
  const t = useT();
  const toast = useToast();
  const { fmt } = useMoney();
  const currency = useStore((s) => s.prefs.currency);
  const [origin, setOrigin] = useState("");
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setOrigin(window.location.origin);
    // Phones and tablets only: desktop share sheets are rarely where people's family chats are.
    setCanShare(typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches);
  }, []);

  const code = encodeInvite({
    v: 1,
    id: c.id,
    name: c.name,
    organiser: c.organiser,
    organiserCurrency: currency,
    contribution: c.contribution.toString(),
    n: c.n,
    frequency: c.frequency,
    mode: c.mode,
    joined: c.members.map((m) => m.name),
  });
  const url = origin ? inviteUrl(origin, code) : "";
  const text = t("share.whatsappText", { name: c.name, amount: fmt(c.contribution), frequency: t(`create.frequencyWord.${c.frequency}`), url });

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl">{t("share.title")}</h2>
        <p className="text-ink-muted mt-1">{t("share.body", { count: c.n - c.members.length, name: c.name })}</p>
        <p className="mt-2 text-sm font-semibold">{t("share.waiting", { joined: c.members.length, total: c.n })}</p>
      </div>
      <div className="bg-paper-sunk text-ink-muted truncate rounded-xl px-4 py-3 font-mono text-xs" title={url}>
        {url || "…"}
      </div>
      {/* On phones the system share sheet is the one button people expect; copy and WhatsApp stay as fallbacks. */}
      {canShare && (
        <Button
          size="lg"
          onClick={async () => {
            try {
              await navigator.share({ title: c.name, text });
            } catch {
              // Share sheet dismissed.
            }
          }}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12M8 7l4-4 4 4M7 10H5v10h14V10h-2" />
          </svg>
          {t("circle.shareInvite")}
        </Button>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          size="lg"
          variant={canShare ? "outline" : "primary"}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast({ tone: "success", title: t("common.copied") });
            } catch {
              toast({ tone: "warning", title: url });
            }
          }}
        >
          {t("common.copy")}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="border-line-strong bg-paper-raised inline-flex min-h-13 items-center justify-center gap-2 rounded-pill border px-6 font-semibold"
        >
          <svg viewBox="0 0 24 24" className="size-5 text-[#1f9d55]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
            <path d="M4 20l1.3-3.9A8 8 0 1112 20a8 8 0 01-3.9-1z" />
          </svg>
          {t("common.shareWhatsApp")}
        </a>
      </div>
      <div className="border-line border-t pt-4">
        <Button variant="ghost" onClick={() => store.fillDemoMembers(c.id)} className="-ms-3">
          {t("share.fillDemo")}
        </Button>
        <p className="text-ink-muted text-xs">{t("share.fillDemoNote")}</p>
      </div>
    </Card>
  );
}
