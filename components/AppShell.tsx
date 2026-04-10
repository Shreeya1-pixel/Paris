"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = pathname === "/map";

  return (
    <>
      {children}
      {!hideNav && <BottomNav />}
    </>
  );
}
