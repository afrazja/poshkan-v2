import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Starfall Defender (static PWA) lives in public/game/
      { source: "/game", destination: "/game/index.html" },
    ];
  },
};

export default nextConfig;
