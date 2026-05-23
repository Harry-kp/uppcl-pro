/**
 * Stateless CORS-bypass proxy for UPPCL SMART API.
 *
 * This route is a dumb pipe. It forwards requests from the browser
 * to uppcl.sem.jio.com and returns the response as-is.
 *
 * Special paths:
 *   "pubkey" → fetches the RSA public key PEM (GET, no body)
 *   Everything else → forwarded to UPPCL API
 */
import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.UPPCL_BASE_URL ?? "https://uppcl.sem.jio.com";
const API_BASE = `${BASE_URL}/accounts/api`;
const PUBKEY_URL = `${BASE_URL}/uppclsmart/assets/cert/prod/server_public.pem`;

// NOT a secret — this is a public client ID baked into UPPCL's own JavaScript
// bundle at uppcl.sem.jio.com. Every user of the official website sends this
// same key. Override via UPPCL_API_KEY env var if UPPCL ever rotates it.
const DEFAULT_API_KEY = "5ab6ef2e-5051-4923-aa65-dc82883af26b";
const API_KEY = process.env.UPPCL_API_KEY ?? DEFAULT_API_KEY;

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
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  };

  for (const name of FORWARD_HEADERS) {
    const val = req.headers.get(name);
    if (val) h[name] = val;
  }

  if (!h.apikey) h.apikey = API_KEY;
  return h;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const joined = path.join("/");

  if (joined === "pubkey") {
    const r = await fetch(PUBKEY_URL, { headers: upstreamHeaders(req), cache: "no-store" });
    return new NextResponse(await r.text(), {
      status: r.status,
      headers: { "content-type": "text/plain", "cache-control": "public, max-age=86400" },
    });
  }

  const url = `${API_BASE}/${joined}${req.nextUrl.search}`;
  const r = await fetch(url, { headers: upstreamHeaders(req), cache: "no-store" });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = `${API_BASE}/${path.join("/")}`;
  const body = await req.text();
  const headers = upstreamHeaders(req);
  if (!headers["content-type"]) headers["content-type"] = "application/json";

  const r = await fetch(url, { method: "POST", headers, body, cache: "no-store" });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}
