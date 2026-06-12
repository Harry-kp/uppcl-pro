/**
 * Stateless CORS-bypass proxy for UPPCL's *bootstrap* API base.
 *
 * UPPCL's SPA talks to two bases:
 *   - /accounts/api   → handled by src/app/api/uppcl/[...path]/route.ts
 *   - /bootstrap/api  → handled here (tenant preferences, offline centers)
 *
 * Same dumb-pipe contract: forward the request as-is, return the response as-is.
 * See docs/api-reverse-engineering.md §8.
 */
import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.UPPCL_BASE_URL ?? "https://uppcl.sem.jio.com";
const API_BASE = `${BASE_URL}/bootstrap/api`;

// The browser always forwards the public `apikey` header (see proxy_post in
// src/lib/api.ts); this env var is only a server-side fallback.
const API_KEY = process.env.UPPCL_API_KEY;

const FORWARD_HEADERS = [
  "apikey",
  "tenantid",
  "token",
  "authorization",
  "subtenantcode",
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

  if (!h.apikey && API_KEY) h.apikey = API_KEY;
  return h;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = `${API_BASE}/${path.join("/")}${req.nextUrl.search}`;
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
