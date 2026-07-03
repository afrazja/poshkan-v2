import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Owner-only area. Whoever isn't on ADMIN_EMAILS gets a 404 — not a login
// prompt — so the page's existence isn't discoverable. With the env var unset,
// nobody gets in (secure default).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!user?.email || !admins.includes(user.email.toLowerCase())) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-bold">Admin</h1>
      <p className="mt-0.5 text-xs text-muted">Only visible to {user.email}</p>
      {children}
    </div>
  );
}
