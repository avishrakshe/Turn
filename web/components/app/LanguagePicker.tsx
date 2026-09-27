"use client";

import { useStore } from "@/lib/app/hooks";
import { store } from "@/lib/app/store";
import { cn } from "@/lib/cn";
import { LANGUAGES, useT } from "@/lib/i18n";
import { scriptFontClass } from "@/lib/script-fonts";

/** Each language named in its own script and font, whatever the current UI language is. */
export function LanguagePicker() {
  const t = useT();
  const current = useStore((s) => s.prefs.language);
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {LANGUAGES.map((l) => (
          <li key={l.code}>
            <button
              type="button"
              lang={l.code}
              dir={l.dir}
              aria-pressed={current === l.code}
              disabled={!l.ready}
              onClick={() => store.setPrefs({ language: l.code })}
              className={cn(
                scriptFontClass[l.script],
                "font-sans min-h-11 rounded-pill border px-4 text-sm font-semibold",
                current === l.code ? "border-teal bg-teal-soft text-teal-ink" : "border-line text-ink-muted",
                !l.ready && "opacity-50",
              )}
            >
              {l.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-ink-muted text-xs">{t("welcome.languageNote")}</p>
    </>
  );
}
