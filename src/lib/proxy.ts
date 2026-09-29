/**
 * Stateless CORS-bypass proxy for the UPPCL SMART API (server-only).
 *
 * A dumb pipe: forwards browser requests to uppcl.sem.jio.com and returns
 * the response as-is. UPPCL's SPA talks to two bases, each with its own route:
 *   - /accounts/api   → src/app/api/uppcl/[...path]/route.ts
 *   - /bootstrap/api  → src/app/api/bootstrap/[...path]/route.ts
 */
import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.UPPCL_BASE_URL ?? "https://uppcl.sem.jio.com";

// The browser always sends the public `apikey` header (UPPCL_API_KEY in
// src/lib/api.ts); this env var is only a server-side fallback.
const API_KEY = process.env.UPPCL_API_KEY;

const FORWARD_HEADERS = [
  "apikey",
  "tenantid",
  "token",
  "authorization",
  "captchatoken",
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

type Ctx = { params: Promise<{ path: string[] }> };

/** GET + POST handlers that forward to `${BASE_URL}${apiPath}/<path>`. */
export function uppclProxy(apiPath: "/accounts/api" | "/bootstrap/api") {
  const apiBase = `${BASE_URL}${apiPath}`;

  async function GET(req: NextRequest, { params }: Ctx) {
    const { path } = await params;
    const url = `${apiBase}/${path.join("/")}${req.nextUrl.search}`;
    const r = await fetch(url, { headers: upstreamHeaders(req), cache: "no-store" });
    return new NextResponse(await r.text(), {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
    });
  }

  async function POST(req: NextRequest, { params }: Ctx) {
    const { path } = await params;
    const url = `${apiBase}/${path.join("/")}`;
    const body = await req.text();
    const headers = upstreamHeaders(req);
    if (!headers["content-type"]) headers["content-type"] = "application/json";

    const r = await fetch(url, { method: "POST", headers, body, cache: "no-store" });
    return new NextResponse(await r.text(), {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
    });
  }

  return { GET, POST };
}
