"use client";

import Link from "next/link";
import { useState } from "react";
import { TurnMark } from "@/components/ring/TurnMark";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import { promptInstall, useInstall } from "@/lib/pwa";

const DISMISSED = "turn-install-dismissed";

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

/** A quiet "Get the app" card on Home. Hidden once installed, inside the app, or after "Not now". */
export function InstallCard() {
  const t = useT();
  const install = useInstall();
  const [dismissed, setDismissed] = useState(wasDismissed);

  if (!install.ready || install.standalone || install.justInstalled || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Private mode: it just comes back next visit.
    }
  };

  return (
    <aside aria-labelledby="install-card-title" className="bg-teal text-on-teal shadow-soft flex items-center gap-4 rounded-card p-4">
      {/* The mark on a light tile: the teal app icon would disappear into this teal card. */}
      <span aria-hidden className="bg-paper grid size-13 shrink-0 place-items-center rounded-[0.9rem] shadow-sm">
        <TurnMark size={34} />
      </span>
      <div className="min-w-0 flex-1">
        <p id="install-card-title" className="font-semibold">
          {t("install.cardTitle")}
        </p>
        <p className="text-sm opacity-85">{t("install.cardBody")}</p>
        <div className="mt-2 flex items-center gap-1">
          {install.canPrompt ? (
            <Button size="md" variant="primary" className="min-h-10 px-4 text-sm" onClick={() => promptInstall()}>
              {t("install.cardAction")}
            </Button>
          ) : (
            <Link href="/app/get" className="bg-marigold text-on-marigold inline-flex min-h-10 items-center rounded-pill px-4 text-sm font-semibold">
              {t("install.cardAction")}
            </Link>
          )}
          <button type="button" onClick={dismiss} className="min-h-10 rounded-pill px-3 text-sm font-semibold opacity-85 hover:opacity-100">
            {t("install.notNow")}
          </button>
        </div>
      </div>
    </aside>
  );
}
