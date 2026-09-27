// Site-wide constants. URLs come from env so nothing environment-specific is hard-coded.

// On Vercel, without an explicit site URL, fall back to the project's production domain
// (a system variable Vercel exposes to Next.js builds).
const vercelHost = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || (vercelHost ? `https://${vercelHost}` : "http://localhost:3000")
).replace(/\/$/, "");
export const APP_PATH = "/app";

export const TAGLINE = "Save together. Take turns.";
export const DESCRIPTION =
  "The family savings committee you already run, without the worry of anyone running off with the pot.";

export const LINKS = {
  github: "https://github.com/avishrakshe/Turn",
  x: "https://x.com/turncircle",
  xHandle: "@turncircle",
} as const;

const CHAINS: Record<string, { name: string; explorer: string }> = {
  "10143": { name: "Monad testnet", explorer: "https://testnet.monadvision.com" },
  "143": { name: "Monad", explorer: "https://monadvision.com" },
};

export const CHAIN = CHAINS[process.env.NEXT_PUBLIC_CHAIN_ID ?? ""] ?? null;
