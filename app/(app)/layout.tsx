import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      redirect("/auth/login");
    }
  }

  return (
    <div className="min-h-dvh relative ow-app-bg">
      <AppShell>{children}</AppShell>
    </div>
  );
}
