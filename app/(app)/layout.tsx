import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GUEST_COOKIE_NAME } from "@/lib/auth/guest";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get(GUEST_COOKIE_NAME)?.value === "1";

  const supabase = await createClient();

  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session && !isGuest) {
      redirect("/auth/login");
    }
  }

  return (
    <div className="min-h-dvh relative ow-app-bg">
      <AppShell>{children}</AppShell>
    </div>
  );
}
