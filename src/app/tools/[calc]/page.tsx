import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { CalcPageBody, getToolRates } from "../calc-page";
import { TOOL_CALCS, toolCalcBySlug, toolPairBySlug } from "../tools-data";

export const revalidate = 3600;

export function generateStaticParams() {
  return TOOL_CALCS.map((c) => ({ calc: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ calc: string }> }) {
  const { calc } = await params;
  const c = toolCalcBySlug(calc);
  if (!c) return {};
  return {
    title: c.genericTitle,
    description: c.genericDescription,
    alternates: { canonical: `https://www.poshkan.com/tools/${c.slug}` },
    openGraph: {
      title: c.genericTitle,
      description: c.genericDescription,
      url: `https://www.poshkan.com/tools/${c.slug}`,
      siteName: "Poshkan",
      type: "website",
    },
    twitter: { card: "summary_large_image", title: c.genericTitle, description: c.genericDescription },
  };
}

// The generic calculator page defaults to EUR/USD with a pair picker on top.
export default async function CalcPage({ params }: { params: Promise<{ calc: string }> }) {
  const { calc } = await params;
  const c = toolCalcBySlug(calc);
  if (!c) notFound();
  const pair = toolPairBySlug("eurusd")!;
  const rates = await getToolRates(pair);

  return (
    <div className="flex min-h-screen flex-col">
      <CalcPageBody calc={c} pair={pair} rates={rates} isGeneric />
      <SiteFooter />
    </div>
  );
}
