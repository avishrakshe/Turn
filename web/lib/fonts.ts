import { DM_Sans, Fraunces } from "next/font/google";

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
