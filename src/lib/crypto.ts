/**
 * Browser-side crypto utilities.
 *
 * UPPCL dropped RSA-OAEP + AES-GCM encryption on their API — all endpoints
 * now accept plaintext JSON. The only crypto still needed:
 *   1. solveAltcha() — SHA-256 proof-of-work for login captcha
 *   2. appsavyEncrypt() — AES-128-CBC for appsavy complaint portal headers
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function b64Encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

// ─── ALTCHA proof-of-work ─────────────────────────────────────────────────────

export interface AltchaChallenge {
  algorithm: string;
  challenge: string;
  salt: string;
  signature: string;
  maxnumber?: number;
}

/**
 * Solve ALTCHA: find n in [0, maxnum] such that SHA256(salt + n) == challenge.
 * Returns the base64-encoded solution token (captchatoken header value).
 */
export async function solveAltcha(c: AltchaChallenge): Promise<string> {
  const maxnum = c.maxnumber ?? 100_000;
  const target = c.challenge.toLowerCase();
  const encoder = new TextEncoder();
  const startMs = Date.now();

  for (let n = 0; n <= maxnum; n++) {
    const data = encoder.encode(`${c.salt}${n}`);
    const hash = await crypto.subtle.digest("SHA-256", data);
    if (hexEncode(hash) === target) {
      const took = Date.now() - startMs;
      return btoa(
        JSON.stringify({
          algorithm: c.algorithm,
          challenge: c.challenge,
          number: n,
          salt: c.salt,
          signature: c.signature,
          took,
        })
      );
    }
  }
  throw new Error(`ALTCHA challenge unsolvable within ${maxnum}`);
}

// ─── Appsavy AES-128-CBC (constant key, deterministic) ───────────────────────

const APPSAVY_KEY = new TextEncoder().encode("8080808080808080");
const APPSAVY_IV = new TextEncoder().encode("8080808080808080");

/**
 * AES-128-CBC encrypt for appsavy headers.
 * Web Crypto adds PKCS7 padding automatically — do NOT pad manually.
 */
export async function appsavyEncrypt(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const key = await crypto.subtle.importKey("raw", APPSAVY_KEY, "AES-CBC", false, [
    "encrypt",
  ]);
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv: APPSAVY_IV }, key, data);
  return b64Encode(ct);
}

/**
 * The 5 constant encrypted headers for appsavy.com anonymous sessions.
 */
export async function appsavyHeaders(): Promise<Record<string, string>> {
  return {
    appsavylogin: await appsavyEncrypt("anonymous"),
    formid: await appsavyEncrypt("4235"),
    roleid: await appsavyEncrypt("883"),
    sourcetype: await appsavyEncrypt("WEB"),
    token: await appsavyEncrypt(""),
  };
}

// ─── UPPCL /wss bill portal crypto (AES-256-CBC + PBKDF2-SHA1) ────────────────
// consumer.uppcl.org/wss encrypts request & response bodies as `_cdata`:
//   _cdata = saltHex(32B) + ivHex(16B) + base64( AES-256-CBC(plaintext) )
//   key    = PBKDF2-SHA1(passphrase, salt, 1989 iterations, 32 bytes)
// The passphrase is a constant from the /wss SPA bundle (not user-specific).
// This is the path to the official bill PDF (see docs/api-reverse-engineering.md).
const WSS_PASSPHRASE = "2b57ea4715h#2d6abf1360e8";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function wssAesKey(salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WSS_PASSPHRASE),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 1989, hash: "SHA-1" },
    base,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt a request body for the /wss portal → `_cdata` string. */
export async function wssEncrypt(plaintext: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await wssAesKey(salt);
  const data = new TextEncoder().encode(plaintext) as BufferSource;
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv: iv as BufferSource }, key, data);
  return bytesToHex(salt) + bytesToHex(iv) + b64Encode(ct);
}

/** Decrypt a `_cdata` response from the /wss portal → plaintext (usually JSON). */
export async function wssDecrypt(cdata: string): Promise<string> {
  const salt = hexToBytes(cdata.slice(0, 64));
  const iv = hexToBytes(cdata.slice(64, 96));
  const ct = Uint8Array.from(atob(cdata.slice(96)), (c) => c.charCodeAt(0));
  const key = await wssAesKey(salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-CBC", iv: iv as BufferSource }, key, ct as BufferSource);
  return new TextDecoder().decode(pt);
}
