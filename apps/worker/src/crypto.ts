// AES-GCM for secrets at rest, SHA-256 for tokens we only need to compare, HMAC for webhook signatures.

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const keys = new Map<string, Promise<CryptoKey>>();

function aesKey(keyB64: string): Promise<CryptoKey> {
  let key = keys.get(keyB64);
  if (!key) {
    const raw = bytes(keyB64);
    if (raw.length !== 32) throw new Error("LEADKILN_ENCRYPTION_KEY must be 32 bytes, base64.");
    key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    keys.set(keyB64, key);
  }
  return key;
}

/** "v1.<iv>.<ciphertext>", both base64. The version leaves room to rotate keys. */
export async function encrypt(keyB64: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(keyB64),
    new TextEncoder().encode(plain),
  );
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decrypt(keyB64: string, sealed: string): Promise<string> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Unknown secret format.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(iv) }, await aesKey(keyB64), bytes(ct));
  return new TextDecoder().decode(plain);
}

export const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

/** Compares without leaking where the strings differ. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A random URL-safe token. */
export const randomToken = (n = 32) =>
  b64(crypto.getRandomValues(new Uint8Array(n)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const newId = () => crypto.randomUUID();
