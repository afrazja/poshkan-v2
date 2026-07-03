import type { MetadataRoute } from "next";
import { STRATEGIES } from "./strategies/strategies-data";
import { TERMS } from "./learn/terms-data";

const BASE = "https://www.poshkan.com";

// Public, indexable pages only — the app itself lives behind auth.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/strategies`, changeFrequency: "monthly", priority: 0.8 },
    ...STRATEGIES.map((s) => ({
      url: `${BASE}/strategies/${s.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${BASE}/learn`, changeFrequency: "monthly", priority: 0.8 },
    ...TERMS.map((t) => ({
      url: `${BASE}/learn/${t.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    { url: `${BASE}/how-it-works`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/help`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
