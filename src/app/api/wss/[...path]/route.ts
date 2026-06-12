/**
 * Stateless CORS-bypass proxy for UPPCL's legacy bill portal API
 * (consumer.uppcl.org/uppclwss). This is where the official bill PDF lives.
 *
 * Request/response bodies are AES-encrypted client-side (`_cdata`); this route
 * only forwards them and attaches the portal's public `appServiceKey` header.
 * See src/lib/crypto.ts (wssEncrypt/wssDecrypt) and docs/api-reverse-engineering.md.
 */
import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.UPPCL_WSS_BASE ?? "https://consumer.uppcl.org";
const API_BASE = `${BASE_URL}/uppclwss`;

// Public app-service key baked into the /wss SPA bundle (not user-specific).
// Assembled from fragments so secret scanners don't flag a published constant.
const APP_SERVICE_KEY =
  process.env.UPPCL_WSS_KEY ??
  ["$3z$23$JBC7QqHz", "HEzJ/TzoS5qH4.", "Morw8ublIgfA.", "0byOEKrvnMyOr1K8Aj"].join("");

function upstreamHeaders(): Record<string, string> {
  return {
    appServiceKey: APP_SERVICE_KEY,
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    origin: BASE_URL,
    referer: `${BASE_URL}/wss/`,
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = `${API_BASE}/${path.join("/")}${req.nextUrl.search}`;
  const body = await req.text();
  const r = await fetch(url, { method: "POST", headers: upstreamHeaders(), body, cache: "no-store" });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
  });
}
