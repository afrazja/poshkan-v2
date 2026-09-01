import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Owner-only area, gated on ADMIN_EMAILS. With the env var unset nobody gets in
// (secure default).
//
// Two different rejections on purpose:
//   • signed in but not an admin → 404, so a logged-in user can never discover
//     that this page exists;
//   • signed out → the login page with ?next=/admin, so arriving here from a
//     fresh browser lands you back on /admin after signing in instead of
//     dumping you on the dashboard. Only that an /admin route exists is
//     revealed, which any URL guess would show anyway — the credential check
//     is unchanged, and there is no second password.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signup?tab=login&next=/admin");

  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!user.email || !admins.includes(user.email.toLowerCase())) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-bold">Admin</h1>
      <p className="mt-0.5 text-xs text-muted">Only visible to {user.email}</p>
      {children}
    </div>
  );
}
