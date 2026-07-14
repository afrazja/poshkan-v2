import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Starfall Defender (static PWA) lives in public/game/.
      // Redirect (not rewrite) so the page URL ends in /game/index.html and its
      // relative manifest/sw/icon URLs resolve inside /game/ — a rewrite would
      // leave the browser at /game and resolve them against the site root,
      // colliding with the app's own manifest and push service worker.
      { source: "/game", destination: "/game/index.html", permanent: false },
    ];
  },
};

export default nextConfig;
