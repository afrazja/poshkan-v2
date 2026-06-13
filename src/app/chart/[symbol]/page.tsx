import ChartView from "@/components/ChartView";

export const metadata = { title: "Advanced chart — Poshkan" };

// Full-screen TradingView advanced chart, opened in a new tab for deep analysis.
export default async function ChartPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <ChartView symbol={decodeURIComponent(symbol)} />;
}
