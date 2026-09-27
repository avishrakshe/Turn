import type { Mode } from "@/lib/economics/engine";
import type { DisplayCurrency } from "@/lib/money";
import type { Frequency } from "./templates";

// Invite links. On the live app a code is the circle's address plus the invite secret, and the
// page reads everything else from the chain. In demo mode there is no chain, so the code carries
// the circle's summary itself (base64url JSON). It holds no secrets and moves no money.

export interface InviteSummary {
  v: 1;
  id: string;
  name: string;
  organiser: string;
  organiserCurrency: DisplayCurrency;
  contribution: string; // AUSD base units
  n: number;
  frequency: Frequency;
  mode: Mode;
  joined: string[]; // names of members already in
}

const toB64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeInvite(i: InviteSummary): string {
  return toB64Url(JSON.stringify(i));
}

export function decodeInvite(code: string): InviteSummary | null {
  try {
    const i = JSON.parse(fromB64Url(code)) as InviteSummary;
    const ok =
      i.v === 1 &&
      typeof i.id === "string" &&
      typeof i.name === "string" &&
      /^\d+$/.test(i.contribution) &&
      Number.isInteger(i.n) &&
      i.n >= 3 &&
      i.n <= 20 &&
      Array.isArray(i.joined) &&
      i.joined.length < i.n + 1;
    return ok ? i : null;
  } catch {
    return null;
  }
}

/** Accepts a full link or a bare code. */
export function codeFromLink(input: string): string | null {
  const t = input.trim();
  const m = /\/app\/join\/([A-Za-z0-9_-]+)/.exec(t);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
}

export const inviteUrl = (origin: string, code: string) => `${origin}/app/join/${code}`;
