"use client";

import { createContext, type ReactNode, useCallback, useContext } from "react";
import { en, type Messages } from "./en";

export type Lang = "en" | "hi" | "ml" | "ta" | "ur";

export const LANGUAGES: Array<{ code: Lang; label: string; dir: "ltr" | "rtl"; ready: boolean }> = [
  { code: "en", label: "English", dir: "ltr", ready: true },
  { code: "hi", label: "हिन्दी", dir: "ltr", ready: false },
  { code: "ml", label: "മലയാളം", dir: "ltr", ready: false },
  { code: "ta", label: "தமிழ்", dir: "ltr", ready: false },
  { code: "ur", label: "اردو", dir: "rtl", ready: false },
];

const CATALOG: Partial<Record<Lang, Messages>> = { en };

type Vars = Record<string, string | number>;
export type T = (key: string, vars?: Vars) => string;

function lookup(messages: Messages, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), messages);
}

function interpolate(s: string, vars?: Vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

export function translate(lang: Lang, key: string, vars?: Vars): string {
  let v = lookup(CATALOG[lang] ?? en, key) ?? lookup(en, key);
  // Plurals: { one, other } chosen by vars.count.
  if (v && typeof v === "object" && "other" in (v as object)) {
    const forms = v as { one?: string; other: string };
    v = vars && Number(vars.count) === 1 && forms.one ? forms.one : forms.other;
  }
  if (typeof v !== "string") {
    if (process.env.NODE_ENV !== "production") console.warn(`missing message: ${key}`);
    return key;
  }
  return interpolate(v, vars);
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
