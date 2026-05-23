/**
 * DEBUG ONLY — server-side login using Node.js crypto.
 * Mirrors the Python proxy's encryption exactly.
 * Hit: POST /api/debug/login with {"username":"...","password":"..."}
 * Delete this file before merging.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash, publicEncrypt, randomBytes, createCipheriv, constants } from "crypto";

const BASE_URL = "https://uppcl.sem.jio.com";
const API_BASE = `${BASE_URL}/accounts/api`;
const PUBKEY_URL = `${BASE_URL}/uppclsmart/assets/cert/prod/server_public.pem`;
const API_KEY = "5ab6ef2e-5051-4923-aa65-dc82883af26b";
const DEFAULT_TENANT = "b3ba0ab0-05bc-11f0-bf77-932b3a8bb3cd";

function tenantHeader(t: string) {
  return JSON.stringify({ isMultiLevel: true, code: t });
}

function defaultHeaders() {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en",
    "content-type": "application/json",
    origin: BASE_URL,
    referer: `${BASE_URL}/uppclsmart/`,
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    apikey: API_KEY,
    tenantid: tenantHeader(DEFAULT_TENANT),
  };
}

// ALTCHA solver — identical to Python
function solveAltcha(salt: string, challenge: string, maxnum: number): number {
  const target = challenge.toLowerCase();
  for (let n = 0; n <= maxnum; n++) {
    const hash = createHash("sha256").update(`${salt}${n}`).digest("hex");
    if (hash === target) return n;
  }
  throw new Error(`ALTCHA unsolvable within ${maxnum}`);
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const log: string[] = [];

  try {
    // 1. ALTCHA
    log.push("1. Fetching ALTCHA challenge...");
    const altR = await fetch(`${API_BASE}/altcha/createAltCaptcha`, {
      headers: defaultHeaders(),
      cache: "no-store",
    });
    const alt = await altR.json();
    log.push(`   challenge received: salt=${alt.salt?.slice(0, 10)}... maxnum=${alt.maxnumber}`);

    const n = solveAltcha(alt.salt, alt.challenge, alt.maxnumber ?? 100000);
    const captcha = Buffer.from(JSON.stringify({
      algorithm: alt.algorithm,
      challenge: alt.challenge,
      number: n,
      salt: alt.salt,
      signature: alt.signature,
    })).toString("base64");
    log.push(`   solved: n=${n}, token length=${captcha.length}`);

    // 2. Public key
    log.push("2. Fetching public key...");
    const pkR = await fetch(PUBKEY_URL, { headers: defaultHeaders(), cache: "no-store" });
    const pem = await pkR.text();
    log.push(`   PEM: ${pem.length} chars, starts: ${pem.slice(0, 40)}`);

    // 3. Encrypt — EXACTLY like Python
    for (const oaepHash of ["sha256", "sha1"] as const) {
      log.push(`3. Encrypting with OAEP-${oaepHash}...`);

      const aesKey = randomBytes(32);
      const iv = randomBytes(12);
      const plaintext = JSON.stringify({ username, password, roleType: "user" });
      log.push(`   plaintext: ${plaintext.length} bytes → ${plaintext}`);

      // AES-256-GCM
      const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
      const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      const ct = Buffer.concat([enc, tag]); // ciphertext + tag, same as Python AESGCM
      log.push(`   AES-GCM: ${enc.length} enc + ${tag.length} tag = ${ct.length} bytes`);

      // RSA-OAEP wrap
      const wrapped = publicEncrypt(
        { key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash },
        aesKey
      );
      log.push(`   RSA-OAEP wrapped key: ${wrapped.length} bytes`);

      // Build envelope — EXACTLY like Python's _wrap()
      const inner = JSON.stringify({
        payload: ct.toString("base64"),
        key: wrapped.toString("base64"),
        iv: iv.toString("base64"),
      });
      log.push(`   inner JSON: ${inner.length} chars`);
      log.push(`   inner preview: ${inner.slice(0, 100)}`);

      // Outer body — Python httpx uses json.dumps with default separators (spaces)
      const body = JSON.stringify({ payload: inner });
      log.push(`   outer body: ${body.length} chars`);
      log.push(`   outer preview: ${body.slice(0, 120)}`);

      // 4. Send to UPPCL
      log.push("4. Sending to UPPCL...");
      const r = await fetch(`${API_BASE}/auth/v2/login`, {
        method: "POST",
        headers: {
          ...defaultHeaders(),
          captchatoken: captcha,
        },
        body,
        cache: "no-store",
      });
      const respText = await r.text();
      log.push(`   response: ${r.status} ${r.statusText}`);
      log.push(`   body: ${respText.slice(0, 500)}`);

      if (r.status === 200) {
        return NextResponse.json({ ok: true, log, response: JSON.parse(respText) });
      }

      // Check if crypto error
      const lower = respText.toLowerCase();
      if (["decrypt", "padding", "oaep", "crypto"].some((k) => lower.includes(k))) {
        log.push(`   → crypto error, trying next hash`);
        continue;
      }
      if (r.status === 409) {
        log.push(`   → 409, trying next hash`);
        continue;
      }

      return NextResponse.json({ ok: false, log, status: r.status, error: respText }, { status: r.status });
    }

    return NextResponse.json({ ok: false, log, error: "All OAEP variants rejected" }, { status: 500 });
  } catch (e) {
    log.push(`EXCEPTION: ${(e as Error).message}`);
    return NextResponse.json({ ok: false, log, error: (e as Error).message }, { status: 500 });
  }
}
