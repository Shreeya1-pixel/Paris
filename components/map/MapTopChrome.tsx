"use client";

import Link from "next/link";
import { Navigation, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/components/LanguageProvider";
import { LanguageToggle } from "@/components/LanguageToggle";

interface MapTopChromeProps {
  /** e.g. coordinates or neighbourhood; defaults to “Near you”. */
  cityLabel?: string;
  onRecenter?: () => void;
}

export function MapTopChrome({ onRecenter }: MapTopChromeProps) {
  const { t } = useLanguage();

  return (
    <>
      <header className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between px-4 pt-safe-top pb-2 pointer-events-none gap-2">
        <div className="pointer-events-auto flex flex-col items-end gap-2 shrink-0">
          <LanguageToggle size="sm" layoutId="lang-pill-map" />
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
