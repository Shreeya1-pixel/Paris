import { AppShell } from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh relative ow-app-bg">
      <AppShell>{children}</AppShell>
    </div>
  );
}
