/** /join/<circle>?s=<invite secret>&n=<name>. The name is only a suggestion the joiner saves in their own vault. */
export function inviteLink(circle: string, secret: string, name: string) {
  const u = new URL(`/join/${circle}`, window.location.origin);
  u.searchParams.set("s", secret);
  if (name) u.searchParams.set("n", name);
  return u.toString();
}
