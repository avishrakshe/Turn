/** The message an account signs to store its (already encrypted) vault. Shared by client and server. */
export async function vaultWriteMessage(sealed: { nonce: string; ciphertext: string }, timestamp: number) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${sealed.nonce}.${sealed.ciphertext}`));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `Turn: save my encrypted address book\n${hex}\n${timestamp}`;
}
