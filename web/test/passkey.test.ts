import { describe, expect, it } from "vitest";
import { mnemonicToAccount } from "viem/accounts";
import { accountFromPrf, inviteSecret, mnemonicFromPrf, open, saltFor, seal } from "../lib/passkey";

const prfA = new Uint8Array(32).fill(7);
const prfB = new Uint8Array(32).fill(9);

describe("passkey namespaces", () => {
  it("uses a distinct 32-byte salt per namespace", async () => {
    const salts = await Promise.all((["account", "vault", "invite"] as const).map(saltFor));
    for (const s of salts) expect(s.length).toBe(32);
    const hex = salts.map((s) => Buffer.from(s).toString("hex"));
    expect(new Set(hex).size).toBe(3);
  });

  it("account = standard BIP-39/BIP-44 wallet: the exported phrase imports anywhere", () => {
    const { account, session } = accountFromPrf(prfA);
    const standard = mnemonicToAccount(mnemonicFromPrf(prfA)); // m/44'/60'/0'/0/0, like MetaMask
    expect(account.address).toBe(standard.address);
    expect(mnemonicFromPrf(prfA).split(" ")).toHaveLength(24);
    expect(accountFromPrf(prfA).account.address).toBe(account.address); // deterministic
    expect(accountFromPrf(prfB).account.address).not.toBe(account.address);
    session.end();
  });

  it("vault: AES-GCM round trip; the wrong passkey output cannot open it", async () => {
    const book = { contacts: [{ name: "Mom", address: "0xabc" }] };
    const sealed = await seal(prfA, book);
    expect(sealed.ciphertext).not.toContain("Mom");
    expect(await open(prfA, sealed)).toEqual(book);
    await expect(open(prfB, sealed)).rejects.toThrow();
  });

  it("invite: deterministic per circle, unrelated across circles and passkeys", async () => {
    const c1 = "0x1111111111111111111111111111111111111111";
    const c2 = "0x2222222222222222222222222222222222222222";
    const s1 = await inviteSecret(prfA, c1);
    expect(s1).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await inviteSecret(prfA, c1.toUpperCase().replace("0X", "0x"))).toBe(s1);
    expect(await inviteSecret(prfA, c2)).not.toBe(s1);
    expect(await inviteSecret(prfB, c1)).not.toBe(s1);
  });
});
