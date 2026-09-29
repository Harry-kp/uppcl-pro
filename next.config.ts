import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old tabs folded into newer hubs; keep old bookmarks working.
  async redirects() {
    return [
      { source: "/complaints", destination: "/support", permanent: false }, // 1912 complaints → Support
      { source: "/recharges", destination: "/ledger", permanent: false }, // recharge planner → Bills
      { source: "/insights", destination: "/analytics", permanent: false }, // insights split across tabs; land on Usage
    ];
  },
};

export default nextConfig;
