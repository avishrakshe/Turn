"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMessages, useT } from "@/lib/i18n";
import { promptInstall, useInstall } from "@/lib/pwa";

/**
 * "Get the app": installs Turn to the home screen. Chrome and Edge get the native install
 * button; iPhone gets Share → Add to Home Screen steps; other apps' built-in browsers are told
 * to open the link in a real browser; desktop gets a QR code to carry it over to a phone.
 */
export function InstallPanel({ qrSvg, url }: { qrSvg: string; url: string }) {
  const t = useT();
  const m = useMessages();
  const install = useInstall();

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col items-center gap-4 pt-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 192px PNG, no optimisation needed */}
        <img src="/icons/icon-192.png" alt="" width={88} height={88} className="shadow-lift rounded-[1.4rem]" />
        <h1 className="text-4xl">{t("install.title")}</h1>
        <p className="text-ink-muted max-w-sm">{t("install.lead")}</p>
      </header>

      <ul className="flex flex-col gap-3">
        {m.install.benefits.map((b) => (
          <li key={b} className="flex items-center gap-3">
            <span className="bg-teal-soft text-teal-ink grid size-8 shrink-0 place-items-center rounded-full" aria-hidden>
              <svg viewBox="0 0 16 16" className="size-4">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-medium">{b}</span>
          </li>
        ))}
      </ul>

      {!install.ready ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : install.standalone || install.justInstalled ? (
        <Card tone="sunk" className="flex items-start gap-3" role="status">
          <span className="bg-success text-on-teal mt-0.5 grid size-7 shrink-0 place-items-center rounded-full" aria-hidden>
            <svg viewBox="0 0 16 16" className="size-4">
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="font-semibold">{install.standalone ? t("install.standalone") : t("install.installed")}</p>
        </Card>
      ) : install.inAppBrowser ? (
        <InAppBrowser url={url} />
      ) : (
        <>
          {install.platform === "desktop" && <QrCard qrSvg={qrSvg} />}
          {install.canPrompt ? (
            <div className="flex flex-col gap-2">
              {install.platform === "desktop" && <p className="text-ink-muted text-sm">{t("install.desktopInstall")}</p>}
              <Button size="lg" onClick={() => promptInstall()}>
                <DownloadIcon />
                {t("install.install")}
              </Button>
            </div>
          ) : install.platform === "ios" ? (
            <Steps title={t("install.iosTitle")} steps={m.install.iosSteps} note={t("install.iosNotSafari")} firstIcon={<ShareIcon />} />
          ) : install.platform === "android" ? (
            <Steps title={t("install.androidTitle")} steps={m.install.androidSteps} firstIcon={<MenuIcon />} />
          ) : null}
        </>
      )}
    </div>
  );
}

function Steps({ title, steps, note, firstIcon }: { title: string; steps: readonly string[]; note?: string; firstIcon: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-sans text-base font-semibold tracking-normal">{title}</h2>
      <ol className="flex flex-col gap-4">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-3">
            <span className="bg-marigold text-on-marigold tabular grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold">{i + 1}</span>
            <span className="flex-1 pt-0.5">{s}</span>
            {i === 0 && <span className="text-teal-ink shrink-0">{firstIcon}</span>}
          </li>
        ))}
      </ol>
      {note && <p className="text-ink-muted border-line border-t pt-3 text-sm">{note}</p>}
    </Card>
  );
}

function QrCard({ qrSvg }: { qrSvg: string }) {
  const t = useT();
  return (
    <Card className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
      {/* Always light: scanners need dark modules on a light ground, in either theme. */}
      <div className="w-40 shrink-0 rounded-2xl bg-[#fbf6ee] p-3" aria-hidden dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <div>
        <h2 className="font-sans text-base font-semibold tracking-normal">{t("install.desktopTitle")}</h2>
        <p className="text-ink-muted mt-1 text-sm">{t("install.desktopBody")}</p>
      </div>
    </Card>
  );
}

function InAppBrowser({ url: fallback }: { url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  // The page they're actually on (preview deploys, custom domains), not the configured site URL.
  const url = typeof window === "undefined" ? fallback : `${window.location.origin}/app/get`;
  return (
    <Card tone="sunk" className="flex flex-col gap-3">
      <p className="font-medium">{t("install.inApp")}</p>
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            // Clipboard blocked: the link is still visible below to copy by hand.
          }
        }}
      >
        {t("install.copyLink")}
      </Button>
      <p className="text-ink-muted font-mono text-xs break-all" aria-live="polite">
        {copied ? t("install.copied") : url}
      </p>
    </Card>
  );
}

const icon = { viewBox: "0 0 24 24", className: "size-6", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Safari's share glyph: a box with an arrow leaving it. */
function ShareIcon() {
  return (
    <svg {...icon} aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4M7 10H5v10h14V10h-2" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg {...icon} aria-hidden>
      <circle cx="12" cy="5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg {...icon} className="size-5" aria-hidden>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );
}
