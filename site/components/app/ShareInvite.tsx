"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useFrequencyText, useMoney } from "@/lib/app/hooks";
import { inviteUrl } from "@/lib/app/invite";
import type { Frequency } from "@/lib/app/templates";
import { useT } from "@/lib/i18n";
import { inviteSecret } from "@/lib/live/passkey";
import { useSession } from "@/lib/live/session";

/**
 * Invite panel while a circle is forming (organiser only). The link's secret is rebuilt from the passkey's invite
 * key, so it's the same link on any device and nothing is stored. Copy, WhatsApp, or the phone's share sheet.
 */
export function ShareInvite({
  circle,
  name,
  size,
  joined,
  contribution,
  frequency,
}: {
  circle: string;
  name: string;
  size: number;
  joined: number;
  contribution: bigint;
  frequency: Frequency;
}) {
  const t = useT();
  const toast = useToast();
  const { fmt } = useMoney();
  const freq = useFrequencyText();
  const { unlock, account } = useSession();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    // Phones and tablets only: desktop share sheets are rarely where people's family chats are.
    setCanShare(typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches);
  }, []);

  async function build() {
    setBusy(true);
    try {
      const secret = await inviteSecret(await unlock("invite"), circle);
      setUrl(inviteUrl(window.location.origin, circle, secret, name));
    } catch {
      // Face ID dismissed: the button stays.
    } finally {
      setBusy(false);
    }
  }

  // With the session open the link costs nothing to rebuild, so show it straight away.
  useEffect(() => {
    if (account && !url) void build();
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = t("share.whatsappText", { name, amount: fmt(contribution), frequency: freq.word(frequency), url });

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl">{t("share.title")}</h2>
        <p className="text-ink-muted mt-1">{t("share.body", { count: size - joined, name })}</p>
        <p className="mt-2 text-sm font-semibold">{t("share.waiting", { joined, total: size })}</p>
      </div>
      {!url ? (
        <Button size="lg" variant="secondary" busy={busy} onClick={build}>
          {t("live.showInvite")}
        </Button>
      ) : (
        <>
          <div className="bg-paper-sunk text-ink-muted truncate rounded-xl px-4 py-3 font-mono text-xs" title={url} data-testid="invite-link">
            {url}
          </div>
          {canShare && (
            <Button
              size="lg"
              onClick={async () => {
                try {
                  await navigator.share({ title: name, text });
                } catch {
                  // Share sheet dismissed.
                }
              }}
            >
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
        </>
      )}
    </Card>
  );
}
