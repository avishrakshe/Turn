import { Noto_Naskh_Arabic, Noto_Sans_Devanagari, Noto_Sans_Malayalam, Noto_Sans_Tamil } from "next/font/google";

// Non-Latin script fonts. None are preloaded: each only downloads when an element carrying
// its class renders glyphs in that script (the font-face has a unicode-range). Import this
// module only from the language layer, never from the root layout.
// Each exposes --font-script, which globals.css puts first in the sans stack.

const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-script",
  preload: false,
  display: "swap",
});

const malayalam = Noto_Sans_Malayalam({
  subsets: ["malayalam"],
  weight: ["400", "500", "600"],
  variable: "--font-script",
  preload: false,
  display: "swap",
});

const tamil = Noto_Sans_Tamil({
  subsets: ["tamil"],
  weight: ["400", "500", "600"],
  variable: "--font-script",
  preload: false,
  display: "swap",
});

// Naskh rather than Nastaliq for UI text: far more legible at small sizes and much lighter.
const arabic = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-script",
  preload: false,
  display: "swap",
});

export type Script = "latin" | "devanagari" | "malayalam" | "tamil" | "arabic";

export const scriptFontClass: Record<Script, string> = {
  latin: "",
  devanagari: devanagari.variable,
  malayalam: malayalam.variable,
  tamil: tamil.variable,
  arabic: arabic.variable,
};
