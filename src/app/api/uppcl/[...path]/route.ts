/**
 * Stateless CORS-bypass proxy for UPPCL SMART API.
 *
 * This route is a DUMB PIPE. It:
 *   1. Receives the request from the browser (body is already encrypted)
 *   2. Forwards it verbatim to uppcl.sem.jio.com
 *   3. Returns the upstream response as-is
 *
 * The server NEVER sees:
 *   - User credentials (encrypted client-side before they leave the browser)
 *   - JWT tokens (sent as headers that we forward, but never store/log)
 *   - Plaintext request bodies (AES-GCM encrypted client-side)
 *
 * Special path: "pubkey" → fetches the RSA public key PEM (GET, no body).
 * Special path: "altcha/createAltCaptcha" → fetches ALTCHA challenge (GET).
 * Everything else: POST with encrypted JSON body forwarded to UPPCL.
 */
import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.UPPCL_BASE_URL ?? "https://uppcl.sem.jio.com";
const API_BASE = `${BASE_URL}/accounts/api`;
const PUBKEY_URL = `${BASE_URL}/uppclsmart/assets/cert/prod/server_public.pem`;

// UPPCL-wide constants (public — baked into their SPA bundle)
const DEFAULT_API_KEY = "5ab6ef2e-5051-4923-aa65-dc82883af26b";
const API_KEY = process.env.UPPCL_API_KEY ?? DEFAULT_API_KEY;

// Headers we forward from the browser to UPPCL (client sets these)
const FORWARD_HEADERS = [
  "apikey",
  "tenantid",
  "token",
  "authorization",
  "captchatoken",
  "content-type",
];

function upstreamHeaders(req: NextRequest): Record<string, string> {
  const h: Record<string, string> = {
    accept: "application/json, text/plain, */*",
    "accept-language": "en",
    origin: BASE_URL,
    referer: `${BASE_URL}/uppclsmart/`,
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  };

  for (const name of FORWARD_HEADERS) {
    const val = req.headers.get(name);
    if (val) h[name] = val;
  }

  // Ensure apikey is always present (browser may omit it)
  if (!h.apikey) h.apikey = API_KEY;

  return h;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const joined = path.join("/");

  // Special: RSA public key
  if (joined === "pubkey") {
    const headers = upstreamHeaders(req);
    const r = await fetch(PUBKEY_URL, { headers, cache: "no-store" });
    const pem = await r.text();
    return new NextResponse(pem, {
      status: r.status,
      headers: { "content-type": "text/plain", "cache-control": "public, max-age=86400" },
    });
  }

  // Everything else: forward GET to UPPCL API
  const url = `${API_BASE}/${joined}${req.nextUrl.search}`;
  const headers = upstreamHeaders(req);
  const r = await fetch(url, { headers, cache: "no-store" });
  const body = await r.text();

  return new NextResponse(body, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const joined = path.join("/");
  const url = `${API_BASE}/${joined}`;

  // Forward the encrypted body verbatim
  const body = await req.text();
  const headers = upstreamHeaders(req);
  if (!headers["content-type"]) headers["content-type"] = "application/json";

  const r = await fetch(url, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });
  const respBody = await r.text();

  return new NextResponse(respBody, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}
