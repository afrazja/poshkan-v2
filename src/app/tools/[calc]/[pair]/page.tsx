import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { CalcPageBody, getToolRates } from "../../calc-page";
import { TOOL_CALCS, TOOL_PAIRS, toolCalcBySlug, toolPairBySlug } from "../../tools-data";

export const revalidate = 3600;

export function generateStaticParams() {
  return TOOL_CALCS.flatMap((c) => TOOL_PAIRS.map((p) => ({ calc: c.slug, pair: p.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ calc: string; pair: string }>;
}) {
  const { calc, pair } = await params;
  const c = toolCalcBySlug(calc);
  const p = toolPairBySlug(pair);
  if (!c || !p) return {};
  const title = c.seoTitle(p);
  const description = c.seoDescription(p);
  const url = `https://www.poshkan.com/tools/${c.slug}/${p.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Poshkan", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CalcPairPage({
  params,
}: {
  params: Promise<{ calc: string; pair: string }>;
}) {
  const { calc, pair } = await params;
  const c = toolCalcBySlug(calc);
  const p = toolPairBySlug(pair);
  if (!c || !p) notFound();
  const rates = await getToolRates(p);

  return (
    <div className="flex min-h-screen flex-col">
      <CalcPageBody calc={c} pair={p} rates={rates} />
      <SiteFooter />
    </div>
  );
}
