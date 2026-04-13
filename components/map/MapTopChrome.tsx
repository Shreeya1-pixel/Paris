"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Navigation, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/components/LanguageProvider";
import { LanguageToggle } from "@/components/LanguageToggle";

interface MapTopChromeProps {
  cityLabel?: string;
  onRecenter?: () => void;
}

export function MapTopChrome({
  cityLabel = "Paris",
  onRecenter,
}: MapTopChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <>
      <header className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between px-4 pt-safe-top pb-2 pointer-events-none gap-2">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="pointer-events-auto text-left rounded-2xl px-3 py-2 bg-white/80 backdrop-blur-md border border-white/60 shadow-sm shrink-0"
        >
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
            {t("map.location")}
          </p>
          <p className="text-sm font-semibold text-zinc-900 flex items-center gap-0.5">
            {cityLabel}
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          </p>
        </button>

        <div className="pointer-events-auto flex flex-col items-end gap-2 shrink-0">
          <LanguageToggle size="sm" layoutId="lang-pill-map" />
          <Link
            href="/profile"
            className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm shadow-md border-2 border-white"
            aria-label={t("map.profileAria")}
          >
            G
          </Link>
        </div>
      </header>

      {/* Floating action buttons — z-[45] keeps them above the AI panel (z-35) and chrome (z-40) */}
      <div className="absolute right-4 z-[45] flex flex-col gap-2 pointer-events-none"
        style={{ bottom: "calc(144px + env(safe-area-inset-bottom, 0px))" }}>
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onRecenter}
          className="pointer-events-auto w-12 h-12 rounded-full bg-white border border-zinc-200 shadow-lg flex items-center justify-center text-zinc-800"
          aria-label={t("map.recenter")}
        >
          <Navigation className="w-5 h-5" />
        </motion.button>
        <Link
          href="/discover"
          className="pointer-events-auto w-12 h-12 rounded-full bg-zinc-700 border border-zinc-600 shadow-lg flex items-center justify-center text-white"
          aria-label={t("map.discoverPeople")}
        >
          <Users className="w-5 h-5" />
        </Link>
      </div>
    </>
  );
}
