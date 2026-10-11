// Invite links: /app/join/<circle address>?s=<invite secret>&n=<circle name>.
// The secret is HMAC(passkey invite key, circle), so the organiser can rebuild the same link on any device; the
// circle only stores its hash. The name is a suggestion the joiner saves in their own encrypted address book.
// Everything else (amount, size, who's in) is read from the chain and the indexer.

export function inviteUrl(origin: string, circle: string, secret: string, name: string): string {
  const u = new URL(`/app/join/${circle}`, origin);
  u.searchParams.set("s", secret);
  if (name) u.searchParams.set("n", name);
  return u.toString();
}

/** Accepts a full invite link (from any host) and returns the in-app path to open, or null. */
export function joinPathFromLink(input: string): string | null {
  const m = /\/(?:app\/)?join\/(0x[0-9a-fA-F]{40})(\?[^\s#]*)?/.exec(input.trim());
  return m ? `/app/join/${m[1]}${m[2] ?? ""}` : null;
}
