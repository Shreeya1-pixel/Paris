"use client";

import Link from "next/link";
import { Plus, Send, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { cn } from "@/lib/utils";
import type { NearbyPlaceFilter } from "@/components/map/MapPlaceFilterBar";

const PLACE_FILTERS: { id: NearbyPlaceFilter; label: string; emoji: string }[] = [
  { id: "cafe", label: "Café", emoji: "☕" },
  { id: "restaurant", label: "Restaurant", emoji: "🍽️" },
  { id: "bar", label: "Bar", emoji: "🍷" },
  { id: "boulangerie", label: "Bakery", emoji: "🥐" },
];

type Chip = {
  labelKey: string;
  vibe: string;
  emoji: string;
};

const CHIPS: Chip[] = [
  { labelKey: "map.aiChip1", vibe: "explore", emoji: "🎯" },
  { labelKey: "map.aiChip2", vibe: "date", emoji: "💕" },
  { labelKey: "map.aiChip3", vibe: "chill", emoji: "🧘" },
  { labelKey: "map.aiChip4", vibe: "nightlife", emoji: "🎵" },
  { labelKey: "map.aiChip5", vibe: "explore", emoji: "🗼" },
];

interface MapBottomChromeProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: () => void;
  searchLoading?: boolean;
  onChipSelect?: (vibe: string, label: string) => void;
  placeFilters?: NearbyPlaceFilter[];
  onPlaceFiltersChange?: (next: NearbyPlaceFilter[]) => void;
}

export function MapBottomChrome({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  searchLoading,
  onChipSelect,
  placeFilters = [],
  onPlaceFiltersChange,
}: MapBottomChromeProps) {
  const { t } = useLanguage();
  const [chipsVisible, setChipsVisible] = useState(true);

  const togglePlace = (id: NearbyPlaceFilter) => {
    if (!onPlaceFiltersChange) return;
    if (placeFilters.includes(id)) {
      onPlaceFiltersChange(placeFilters.filter((x) => x !== id));
    } else {
      onPlaceFiltersChange([...placeFilters, id]);
    }
  };

  const handleChip = (chip: Chip) => {
    const label = t(chip.labelKey as Parameters<typeof t>[0]);
    onSearchChange(label);
    setChipsVisible(false);
    onChipSelect?.(chip.vibe, label);
  };

  return (
    <div className="fixed left-0 right-0 bottom-0 z-40 pb-safe pointer-events-none">
      <div className="pointer-events-auto px-3 pb-2 space-y-2">
        <AnimatePresence>
          {chipsVisible && (
            <motion.div
              key="chips"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22 }}
              className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1 items-center"
            >
              {onPlaceFiltersChange &&
                PLACE_FILTERS.map((f) => {
                  const on = placeFilters.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => togglePlace(f.id)}
                      className={cn(
                        "shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-sans font-semibold border transition-all",
                        on
                          ? "bg-amber-500/25 border-amber-400/60 text-zinc-900 shadow-sm"
                          : "bg-white/75 border-zinc-200/80 text-zinc-600 backdrop-blur-md"
                      )}
                    >
                      <span>{f.emoji}</span>
                      {f.label}
                    </button>
                  );
                })}
              {onPlaceFiltersChange && (
                <span
                  className="shrink-0 w-px h-5 bg-zinc-200/90 self-center mx-0.5"
                  aria-hidden
                />
              )}
              {CHIPS.map((chip) => (
                <button
                  key={chip.labelKey}
                  type="button"
                  onClick={() => handleChip(chip)}
                  className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-sans font-medium bg-white/80 border border-zinc-200/80 text-zinc-700 shadow-sm backdrop-blur-md active:scale-95 transition-transform whitespace-nowrap"
                >
                  <span className="text-[13px] leading-none shrink-0" aria-hidden>
                    {chip.emoji}
                  </span>
                  {t(chip.labelKey as Parameters<typeof t>[0])}
                </button>
              ))}
              <button
                type="button"
                aria-label="Hide suggestions"
                onClick={() => setChipsVisible(false)}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-white/70 border border-zinc-200/60 text-zinc-400 shadow-sm backdrop-blur-md active:scale-95 transition-transform"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2">
          <Link
            href="/events/create"
            className="shrink-0 w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform"
            aria-label={t("nav.create")}
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </Link>

          <div className="flex-1 flex items-center gap-2 h-12 px-4 rounded-full bg-white border border-zinc-200/80 shadow-[var(--ow-shadow-pill)]">
            {!chipsVisible && (
              <button
                type="button"
                onClick={() => setChipsVisible(true)}
                className="shrink-0 text-amber-500"
                aria-label="Show suggestions"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            )}

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
              placeholder={t("map.searchPlaceholder")}
              className="flex-1 bg-transparent text-sm text-zinc-800 placeholder:text-zinc-400 outline-none min-w-0"
            />

            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={onSearchSubmit}
              disabled={!searchQuery.trim() || searchLoading}
              className="shrink-0 w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center disabled:opacity-35 text-white"
              aria-label={t("map.send")}
            >
              {searchLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
