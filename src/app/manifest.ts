import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Poshkan — Paper Trading",
    short_name: "Poshkan",
    description:
      "Risk-free paper trading for US stocks, crypto, and forex — with an AI coach and a leaderboard.",
    start_url: "/",
    display: "standalone",
    // Lets getInstalledRelatedApps() detect our own installed PWA.
    related_applications: [
      { platform: "webapp", url: "https://poshkan.com/manifest.webmanifest" },
    ],
    background_color: "#0b0e14",
    theme_color: "#0b0e14",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
