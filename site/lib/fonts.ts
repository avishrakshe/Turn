import { DM_Sans, Fraunces, JetBrains_Mono } from "next/font/google";

// Display serif: Fraunces with its SOFT axis turned up reads warm and hand-set rather
// than editorial. UI/body: DM Sans, which has true tabular figures for money.
export const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

export const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-dm-sans",
  display: "swap",
});

// Telemetry on the landing page's film and intro. Only the landing page applies it, so only
// that page preloads it.
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});
