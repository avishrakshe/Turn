import type { Mode } from "@/lib/economics/engine";

export type TemplateId = "wedding" | "festival" | "business" | "emergency" | "custom";
export type Frequency = "monthly" | "weekly";

export interface Template {
  id: TemplateId;
  usd: number; // default contribution, converted to the user's currency and rounded
  members: number;
  frequency: Frequency;
  mode: Mode;
  icon: string; // SVG path, 24×24
}

export const TEMPLATES: Template[] = [
  { id: "wedding", usd: 120, members: 10, frequency: "monthly", mode: "AUCTION", icon: "M12 21s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.5-7 10-7 10z" },
  { id: "festival", usd: 25, members: 10, frequency: "monthly", mode: "FIXED_ORDER", icon: "M12 3l2.2 5.4L20 9l-4.4 3.8L17 18.5 12 15.6 7 18.5l1.4-5.7L4 9l5.8-.6z" },
  { id: "business", usd: 300, members: 6, frequency: "monthly", mode: "AUCTION", icon: "M4 9h16l-1.5 11h-13zM8 9V6a4 4 0 018 0v3" },
  { id: "emergency", usd: 40, members: 5, frequency: "monthly", mode: "FIXED_ORDER", icon: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" },
  { id: "custom", usd: 60, members: 5, frequency: "monthly", mode: "FIXED_ORDER", icon: "M12 5v14M5 12h14" },
];

export const MIN_MEMBERS = 3;
export const MAX_MEMBERS = 10; // mainnet beta cap (plan.md §3.5)
