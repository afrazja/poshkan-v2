import type { MetadataRoute } from "next";
import { STRATEGIES } from "./strategies/strategies-data";
import { TERMS } from "./learn/terms-data";
import { SCANS } from "./scans/scans-data";
import { TOOL_CALCS, TOOL_PAIRS } from "./tools/tools-data";
import { SHOWCASE_STOCKS, SHOWCASE_ETFS, CRYPTO_MAJORS, CRYPTO_STABLE } from "@/lib/showcase-universe";

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
    { url: `${BASE}/tools`, changeFrequency: "weekly", priority: 0.8 },
    ...TOOL_CALCS.map((c) => ({
      url: `${BASE}/tools/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...TOOL_CALCS.flatMap((c) =>
      TOOL_PAIRS.map((p) => ({
        url: `${BASE}/tools/${c.slug}/${p.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }))
    ),
    { url: `${BASE}/learn`, changeFrequency: "monthly", priority: 0.8 },
    ...TERMS.map((t) => ({
      url: `${BASE}/learn/${t.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    { url: `${BASE}/scans`, changeFrequency: "daily", priority: 0.8 },
    ...SCANS.map((s) => ({
      url: `${BASE}/scans/${s.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    // One page per symbol: the Ownerâs View in public. These are the pages
    // that answer what people actually search â how far a stock falls, how
    // often it comes back â so they carry the highest priority after the
    // home page.
    ...Array.from(new Set([...SHOWCASE_ETFS, ...SHOWCASE_STOCKS, ...CRYPTO_MAJORS, ...CRYPTO_STABLE])).map(
      (sym) => ({
        url: `${BASE}/symbol/${sym}`,
        changeFrequency: "daily" as const,
        priority: 0.8,
      })
    ),
    { url: `${BASE}/mcp`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/how-it-works`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/help`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
