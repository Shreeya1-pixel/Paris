"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, Compass, Plus, Bookmark, User } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/components/LanguageProvider";

const navKeys = [
  { href: "/map", icon: Map, labelKey: "nav.map" as const },
  { href: "/discover", icon: Compass, labelKey: "nav.discover" as const },
  { href: "/events/create", icon: Plus, labelKey: "nav.create" as const, isCreate: true },
  { href: "/saved", icon: Bookmark, labelKey: "nav.saved" as const },
  { href: "/profile", icon: User, labelKey: "nav.profile" as const },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/75 backdrop-blur-xl border-t border-zinc-200/80 shadow-[0_-4px_24px_rgba(0,0,0,0.04)] pb-safe">
      <div className="flex items-center justify-around h-[72px] max-w-lg mx-auto px-2">
        {navKeys.map(({ href, icon: Icon, labelKey, isCreate }) => {
          const label = t(labelKey);
          const isActive =
            pathname === href || (href !== "/map" && pathname.startsWith(href));

          if (isCreate) {
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center justify-center -mt-5"
                aria-label={label}
              >
                <motion.div
                  whileTap={{ scale: 0.93 }}
                  className="w-[52px] h-[52px] rounded-full bg-zinc-900 flex items-center justify-center shadow-lg"
                >
                  <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                </motion.div>
              </Link>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className="flex flex-col items-center justify-center gap-1 min-w-[56px] h-full py-3 transition-colors"
            >
              <motion.div whileTap={{ scale: 0.92 }}>
                <Icon
                  className="w-5 h-5"
                  strokeWidth={isActive ? 2.5 : 2}
                  style={{ color: isActive ? "#18181b" : "#a1a1aa" }}
                />
              </motion.div>
              <span
                className="text-[10px] font-semibold tracking-wide"
                style={{ color: isActive ? "#18181b" : "#a1a1aa" }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
