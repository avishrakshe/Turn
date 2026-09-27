"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { type Script, scriptFontClass } from "@/lib/script-fonts";

// Reminder previews. Only the selected language renders, so its script font is only
// downloaded when someone picks it. Non-English strings are machine-drafted and listed in
// TRANSLATIONS_TODO.md for review by native speakers.
// Amounts are wrapped in U+2066/U+2069 (left-to-right isolate) so they keep their shape in RTL.

type Lang = "en" | "hi" | "ml" | "ta" | "ur";

const PREVIEWS: Record<Lang, { label: string; name: string; script: Script; dir: "ltr" | "rtl"; text: string }> = {
  en: {
    label: "English",
    name: "Ravi · Mumbai",
    script: "latin",
    dir: "ltr",
    text: "Reminder: your ₹5,000 for Family Circle goes out automatically tomorrow. This month the pot goes to Fatima.",
  },
  hi: {
    label: "हिन्दी",
    name: "Sunita · Jaipur",
    script: "devanagari",
    dir: "ltr",
    text: "याद दिला दें: फ़ैमिली सर्कल के लिए आपके ₹5,000 कल अपने-आप जमा हो जाएँगे। इस महीने की रकम फ़ातिमा को मिलेगी।",
  },
  ml: {
    label: "മലയാളം",
    name: "Anil · Dubai",
    script: "malayalam",
    dir: "ltr",
    text: "ഓർമ്മപ്പെടുത്തൽ: ഫാമിലി സർക്കിളിലേക്കുള്ള നിങ്ങളുടെ AED 220 നാളെ സ്വയമേവ അടയ്ക്കും. ഈ മാസത്തെ തുക ഫാത്തിമയ്ക്ക് ലഭിക്കും.",
  },
  ta: {
    label: "தமிழ்",
    name: "Kavya · Chennai",
    script: "tamil",
    dir: "ltr",
    text: "நினைவூட்டல்: ஃபேமிலி சர்க்கிளுக்கான உங்கள் ₹5,000 நாளை தானாகச் செலுத்தப்படும். இந்த மாதத் தொகை ஃபாத்திமாவுக்குக் கிடைக்கும்.",
  },
  ur: {
    label: "اردو",
    name: "Imran · Dubai",
    script: "arabic",
    dir: "rtl",
    text: "یاد دہانی: فیملی سرکل کے لیے آپ کے ⁦AED 220⁩ کل خود بخود ادا ہو جائیں گے۔ اس مہینے کی رقم فاطمہ کو ملے گی۔",
  },
};

export function Languages() {
  const [lang, setLang] = useState<Lang>("en");
  const p = PREVIEWS[lang];
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_minmax(0,440px)]">
      <div className="flex flex-col gap-4">
        <SegmentedControl
          label="Reminder language"
          value={lang}
          onChange={setLang}
          options={(Object.keys(PREVIEWS) as Lang[]).map((k) => ({ value: k, label: PREVIEWS[k].label }))}
          className="flex w-full max-w-xl flex-wrap sm:flex-nowrap"
        />
        <p className="text-ink-muted max-w-md">
          Reminders arrive on Telegram the day before auto-pay, in the member&rsquo;s own language and currency. The app will speak
          the same five languages, with Urdu laid out right to left.
        </p>
        <p className="text-ink-muted text-sm">Translations are being checked by native speakers before launch.</p>
      </div>
      <div className="bg-paper-sunk rounded-card p-5" aria-live="polite">
        <div className="flex items-center gap-2 text-sm">
          <span className="bg-teal text-on-teal grid size-8 place-items-center rounded-full text-xs font-bold" aria-hidden>
            T
          </span>
          <span className="font-semibold">Turn</span>
          <span className="text-ink-muted">· to {p.name}</span>
        </div>
        <p
          lang={lang}
          dir={p.dir}
          className={cn(
            scriptFontClass[p.script],
            "font-sans bg-paper-raised shadow-soft mt-3 rounded-2xl rounded-ss-md p-4 text-[1.05rem] leading-relaxed",
          )}
        >
          {p.text}
        </p>
      </div>
    </div>
  );
}
