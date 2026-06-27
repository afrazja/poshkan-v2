import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Providers from "@/components/Providers";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import ThemeSync from "@/components/ThemeSync";
import SessionWatcher from "@/components/SessionWatcher";
import BottomNav from "@/components/BottomNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, theme")
    .eq("id", user.id)
    .single();

  const username = profile?.username || user.email?.split("@")[0] || "trader";
  const theme = (profile as { theme?: string | null } | null)?.theme ?? null;

  // For the top-bar account switcher (RLS scopes to the user's own accounts).
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, type")
    .order("created_at", { ascending: true });

  return (
    <Providers>
      <ThemeSync theme={theme} />
      <SessionWatcher />
      <div className="flex min-h-screen flex-col">
        <TopBar username={username} email={user.email ?? ""} accounts={accounts ?? []} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pb-6">
          {children}
        </main>
        <SiteFooter />
      </div>
      <BottomNav />
    </Providers>
  );
}
