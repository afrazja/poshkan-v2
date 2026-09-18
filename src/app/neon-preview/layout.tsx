import { notFound } from "next/navigation";
import { previewEnabled } from "@/lib/neon-preview/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Poshkan · Neon migration test", robots: { index: false, follow: false } };

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (!previewEnabled()) notFound();
  return <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
    <div className="mx-auto max-w-4xl">
      <p className="mb-3 text-sm font-semibold tracking-widest text-teal-300">POSHKAN / LOCAL TEST</p>
      <p className="mb-10 max-w-2xl text-slate-400">Neon migration rehearsal. Your live Poshkan site continues to use Supabase.</p>
      {children}
    </div>
  </main>;
}
