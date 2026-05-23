import type { NextConfig } from "next";

/**
 * Two output modes:
 *   STATIC=1 → `output: "export"` produces a fully-static site (`out/`) that
 *              serves from any HTTP server. This is what we ship to Raspberry
 *              Pi + Caddy — no Node needed on the box.
 *   default  → full Next.js server (for `next dev` / production Node hosts).
 *
 * Our app is 100% client components + SWR, so static export covers every page.
 */
const nextConfig: NextConfig = {
  output: process.env.STATIC === "1" ? "export" : undefined,
  trailingSlash: process.env.STATIC === "1",  // helps when served by static hosts
  images: {
    unoptimized: process.env.STATIC === "1",
  },
};

export default nextConfig;
