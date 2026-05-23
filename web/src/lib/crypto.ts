/**
 * Browser-side crypto for UPPCL SMART API.
 *
 * Ports the Python encrypt_payload() + solve_altcha() to Web Crypto API.
 * Runs entirely in the browser — the server never sees plaintext credentials
 * or request bodies.
 *
 * Flow:
 *   1. solveAltcha()      — brute-force SHA-256 proof-of-work (~10ms)
 *   2. fetchPublicKey()   — fetch + cache RSA public key from UPPCL (via our CORS proxy)
 *   3. encryptPayload()   — AES-256-GCM body encryption + RSA-OAEP key wrapping
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function b64Encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  for (let n = 0; n <= maxnum; n++) {
    const data = encoder.encode(`${c.salt}${n}`);
    const hash = await crypto.subtle.digest("SHA-256", data);
    if (hexEncode(hash) === target) {
      const solution = {
        algorithm: c.algorithm,
        challenge: c.challenge,
        number: n,
        salt: c.salt,
        signature: c.signature,
      };
      return btoa(JSON.stringify(solution));
    }
  }
  throw new Error(`ALTCHA challenge unsolvable within ${maxnum}`);
}

// ─── RSA public key ───────────────────────────────────────────────────────────

let _cachedKey: CryptoKey | null = null;
let _cachedPem: string | null = null;
let _cachedAt = 0;
const KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

/**
 * Fetch UPPCL's RSA public key via our CORS-proxy route.
 * Caches for 24h in memory (same as the Python version).
 */
export async function fetchPublicKey(
  oaepHash: "SHA-256" | "SHA-1" = "SHA-256"
): Promise<CryptoKey> {
  if (_cachedKey && Date.now() - _cachedAt < KEY_TTL_MS) return _cachedKey;

  const r = await fetch("/api/uppcl/pubkey");
  if (!r.ok) throw new Error(`Failed to fetch public key: HTTP ${r.status}`);
  const pem = await r.text();

  if (!pem.includes("BEGIN PUBLIC KEY")) {
    throw new Error(`Unexpected pubkey format: ${pem.slice(0, 80)}`);
  }

  const key = await crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(pem),
    { name: "RSA-OAEP", hash: oaepHash },
    false,
    ["encrypt"]
  );

  _cachedKey = key;
  _cachedPem = pem;
  _cachedAt = Date.now();
  return key;
}

/** Force re-import with a different OAEP hash (for SHA-256 → SHA-1 fallback). */
export async function reimportKeyWithHash(hash: "SHA-256" | "SHA-1"): Promise<CryptoKey> {
  if (!_cachedPem) throw new Error("No cached PEM — call fetchPublicKey() first");
  const key = await crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(_cachedPem),
    { name: "RSA-OAEP", hash },
    false,
    ["encrypt"]
  );
  _cachedKey = key;
  return key;
}

// ─── Payload encryption ───────────────────────────────────────────────────────

export interface EncryptedEnvelope {
  payload: string; // JSON string of {payload, key, iv}
}

/**
 * Encrypt a JSON body for UPPCL:
 *   - Fresh AES-256-GCM key + 12-byte IV per request
 *   - Body encrypted with AES-GCM (tag appended to ciphertext)
 *   - AES key wrapped with RSA-OAEP
 *
 * Returns the outer envelope: { payload: JSON.stringify({payload, key, iv}) }
 */
export async function encryptPayload(
  body: Record<string, unknown>,
  pubKey: CryptoKey
): Promise<EncryptedEnvelope> {
  // Generate fresh AES-256 key + 12-byte IV
  const aesKeyRaw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Import as CryptoKey for AES-GCM
  const aesKey = await crypto.subtle.importKey("raw", aesKeyRaw, "AES-GCM", false, [
    "encrypt",
  ]);

  // Encrypt the JSON body
  const plaintext = new TextEncoder().encode(JSON.stringify(body));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    aesKey,
    plaintext
  );

  // Wrap the AES key with RSA-OAEP
  const wrappedKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    pubKey,
    aesKeyRaw
  );

  const inner = {
    payload: b64Encode(ciphertext),
    key: b64Encode(wrappedKey),
    iv: b64Encode(iv),
  };

  return { payload: JSON.stringify(inner) };
}

// ─── Appsavy AES-128-CBC (constant key, deterministic) ───────────────────────

const APPSAVY_KEY = new TextEncoder().encode("8080808080808080");
const APPSAVY_IV = new TextEncoder().encode("8080808080808080");

/**
 * AES-128-CBC encrypt with PKCS7 padding — matches appsavy.py _aes_b64().
 * Web Crypto doesn't natively support CBC padding, so we do PKCS7 manually.
 */
export async function appsavyEncrypt(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);

  // PKCS7 padding to 16-byte block boundary
  const padLen = 16 - (data.length % 16);
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  padded.fill(padLen, data.length);

  const key = await crypto.subtle.importKey("raw", APPSAVY_KEY, "AES-CBC", false, [
    "encrypt",
  ]);
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv: APPSAVY_IV }, key, padded);

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
