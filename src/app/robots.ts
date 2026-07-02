import type { MetadataRoute } from "next";

// Keep crawlers on the public pages and out of the app + API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/api/", "/auth/"],
      },
    ],
    sitemap: "https://www.poshkan.com/sitemap.xml",
  };
}
