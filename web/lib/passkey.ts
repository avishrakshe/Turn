// Passkey namespaces ("One Passkey, Many Keys"). One mera passkey, several isolated 32-byte PRF salts:
//
//   account  sha256("turn.v1.account")  -> BIP-39 mnemonic -> m/44'/60'/0'/0/0 : the EOA (EIP-7702 -> TurnAccount)
//   vault    sha256("turn.v1.vault")    -> HKDF -> AES-256-GCM              : private address book / profile
//   invite   sha256("turn.v1.invite")   -> HMAC(circle address)             : invite secrets, rebuilt on any device
//
// Every output is recomputed from the passkey on demand and kept in memory only. Nothing secret is persisted.
// Onboarding evaluates only the account salt (one Face ID); other namespaces unlock when first used.
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { LocalAccount } from "viem";

export type Namespace = "account" | "vault" | "invite";

const LABELS: Record<Namespace, string> = {
  account: "turn.v1.account",
  vault: "turn.v1.vault",
  invite: "turn.v1.invite",
};

export async function saltFor(ns: Namespace): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(LABELS[ns]));
  return new Uint8Array(digest);
}

export const ACCOUNT_PATH = "m/44'/60'/0'/0/0";

export function rp() {
  return { id: window.location.hostname, name: "Turn" };
}

/** Evaluate one namespace with a Face ID prompt. With no credential, any Turn passkey on this device can answer. */
export async function evaluate(ns: Namespace): Promise<Uint8Array<ArrayBuffer>> {
  const { prfOutput } = await getPasskeyPrfOutput({ rpId: rp().id, prfSalt: await saltFor(ns) });
  return prfOutput;
}

/** First visit: create the passkey and evaluate the account namespace in the same ceremony. */
export async function createPasskey(displayName: string): Promise<Uint8Array<ArrayBuffer>> {
  const created = await createPasskeyWithPrfOutput({
    rp: rp(),
    user: { name: displayName || "Turn member", displayName: displayName || "Turn member" },
    prfSalt: await saltFor("account"),
  });
  return created.prfOutput;
}

// ---- account namespace -----------------------------------------------------------------------------

export function mnemonicFromPrf(prf: Uint8Array): string {
  return entropyToMnemonic(prf, wordlist);
}

export type AccountSession = { account: LocalAccount<"mera">; session: Secp256k1SigningSession };

/** PRF -> BIP-39 -> BIP-44 key -> mera signing session -> viem account. The private key never leaves memory. */
export function accountFromPrf(prf: Uint8Array): AccountSession {
  const seed = mnemonicToSeedSync(mnemonicFromPrf(prf));
  const node = HDKey.fromMasterSeed(seed).derive(ACCOUNT_PATH);
  if (!node.privateKey) throw new Error("derivation failed");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  node.privateKey.fill(0);
  seed.fill(0);
  return { account: toViemAccount(session), session };
}

// ---- vault namespace: encryption --------------------------------------------------------------------

async function vaultKey(prf: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", prf, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("turn.v1.vault.aes-gcm") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export type Sealed = { v: 1; nonce: string; ciphertext: string };

export async function seal(prf: Uint8Array<ArrayBuffer>, data: unknown): Promise<Sealed> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await vaultKey(prf),
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return { v: 1, nonce: b64u(nonce), ciphertext: b64u(new Uint8Array(ct)) };
}

export async function open<T>(prf: Uint8Array<ArrayBuffer>, sealed: Sealed): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64u(sealed.nonce) },
    await vaultKey(prf),
    unb64u(sealed.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

// ---- invite namespace: capability derivation ---------------------------------------------------------

/** Invite secret for a circle: HMAC-SHA256(invite PRF, circle address). Same passkey -> same link, anywhere. */
export async function inviteSecret(prf: Uint8Array<ArrayBuffer>, circle: string): Promise<`0x${string}`> {
  const key = await crypto.subtle.importKey("raw", prf, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(circle.toLowerCase())));
  return `0x${Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
