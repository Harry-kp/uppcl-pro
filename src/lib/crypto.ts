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
