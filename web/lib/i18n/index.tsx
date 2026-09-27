"use client";

import { createContext, type ReactNode, useCallback, useContext } from "react";
import type { Script } from "@/lib/script-fonts";
import { en, type Messages } from "./en";
import { hi } from "./hi";
import { ml } from "./ml";
import { ta } from "./ta";
import { ur } from "./ur";

export type Lang = "en" | "hi" | "ml" | "ta" | "ur";

export const LANGUAGES: Array<{ code: Lang; label: string; dir: "ltr" | "rtl"; script: Script; locale: string; ready: boolean }> = [
  { code: "en", label: "English", dir: "ltr", script: "latin", locale: "en-IN", ready: true },
  { code: "hi", label: "हिन्दी", dir: "ltr", script: "devanagari", locale: "hi-IN", ready: true },
  { code: "ml", label: "മലയാളം", dir: "ltr", script: "malayalam", locale: "ml-IN", ready: true },
  { code: "ta", label: "தமிழ்", dir: "ltr", script: "tamil", locale: "ta-IN", ready: true },
  // Latin digits for Urdu: members in India and the Gulf read amounts that way.
  { code: "ur", label: "اردو", dir: "rtl", script: "arabic", locale: "ur-IN-u-nu-latn", ready: true },
];

export const langInfo = (lang: Lang) => LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]!;

const CATALOG: Record<Lang, Messages> = { en, hi, ml, ta, ur };
const plurals = new Map<Lang, Intl.PluralRules>();

type Vars = Record<string, string | number>;
export type T = (key: string, vars?: Vars) => string;

function lookup(messages: Messages, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), messages);
}

// In RTL text each value sits in a first-strong isolate (U+2068…U+2069): "AED 220" and
// Latin names keep their own direction and can't reorder the punctuation around them. URLs are
// left bare so chat apps still link them (they stand alone, and are LTR by nature anyway).
function interpolate(s: string, vars?: Vars, isolate = false) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (!(k in vars)) return m;
    const v = String(vars[k]);
    return isolate && !/^https?:\/\//.test(v) ? `⁨${v}⁩` : v;
  });
}

export function translate(lang: Lang, key: string, vars?: Vars): string {
  let v = lookup(CATALOG[lang] ?? en, key) ?? lookup(en, key);
  // Plurals: { one, other }, chosen by each language's own rules (Hindi treats 0 as "one").
  if (v && typeof v === "object" && "other" in (v as object)) {
    const forms = v as { one?: string; other: string };
    let rules = plurals.get(lang);
    if (!rules) plurals.set(lang, (rules = new Intl.PluralRules(langInfo(lang).locale)));
    v = vars && rules.select(Number(vars.count)) === "one" && forms.one ? forms.one : forms.other;
  }
  if (typeof v !== "string") {
    if (process.env.NODE_ENV !== "production") console.warn(`missing message: ${key}`);
    return key;
  }
  return interpolate(v, vars, langInfo(lang).dir === "rtl");
}

const LangContext = createContext<Lang>("en");

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useT(): T {
  const lang = useContext(LangContext);
  return useCallback((key: string, vars?: Vars) => translate(lang, key, vars), [lang]);
}

export function useLang(): Lang {
  return useContext(LangContext);
}

/** Arrays (e.g. stepper labels) straight from the catalog. */
export function useMessages(): Messages {
  const lang = useContext(LangContext);
  return CATALOG[lang] ?? en;
}
