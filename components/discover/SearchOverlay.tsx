"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, SlidersHorizontal } from "lucide-react";
import { CATEGORIES, ARRONDISSEMENTS } from "@/lib/constants";
import type { ParisCategory } from "@/types";
import { useLanguage } from "@/components/LanguageProvider";
import { cn } from "@/lib/utils";

export interface SearchFilters {
  q: string;
  categories: ParisCategory[];
  freeOnly: boolean;
  arrondissement?: string;
}

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (f: SearchFilters) => void;
  initialFilters: SearchFilters;
}

export function SearchOverlay({ isOpen, onClose, onApply, initialFilters }: SearchOverlayProps) {
  const { t } = useLanguage();
  const [f, setF] = useState<SearchFilters>(initialFilters);

  useEffect(() => {
    if (isOpen) setF(initialFilters);
  }, [isOpen, initialFilters]);

  const toggleCat = (id: ParisCategory) => {
    setF((prev) => ({
      ...prev,
      categories: prev.categories.includes(id)
        ? prev.categories.filter((c) => c !== id)
        : [...prev.categories, id],
    }));
  };

  const handleApply = () => {
    onApply(f);
    onClose();
  };

  const handleReset = () =>
    setF({ q: "", categories: [], freeOnly: false, arrondissement: undefined });

  const activeCount =
    (f.q.trim() ? 1 : 0) + f.categories.length + (f.arrondissement ? 1 : 0) + (f.freeOnly ? 1 : 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            key="bd"
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 cursor-default border-0 p-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(24,24,27,0.35) 0%, rgba(24,24,27,0.5) 100%), rgba(244,244,245,0.4)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
            onClick={onClose}
          />

          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discover-filter-title"
            initial={{ y: "104%" }}
            animate={{ y: 0 }}
            exit={{ y: "104%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed left-0 right-0 bottom-0 z-50 max-h-[88dvh] flex flex-col rounded-t-[28px] overflow-hidden shadow-[0_-12px_48px_rgba(15,23,42,0.12)] border-t border-x border-white/70"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.86) 100%)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
            }}
          >
            {/* Mesh tint — matches ow-app-bg */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.45]"
              style={{
                backgroundImage: `
                  radial-gradient(ellipse 70% 40% at 15% 0%, #e0e7ff, transparent),
                  radial-gradient(ellipse 50% 35% at 95% 15%, #fce7f3, transparent),
                  radial-gradient(ellipse 45% 30% at 50% 100%, #ddd6fe, transparent)
                `,
              }}
            />

            <div className="relative flex flex-col flex-1 min-h-0">
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-zinc-300/80" aria-hidden />
              </div>

              <div className="flex items-start justify-between px-5 pt-2 pb-4 border-b border-zinc-200/50 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-zinc-200/60"
                    style={{
                      background: "rgba(255,255,255,0.65)",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                    }}
                  >
                    <SlidersHorizontal className="w-5 h-5 text-zinc-700" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="discover-filter-title"
                      className="font-display text-xl font-semibold text-zinc-900 tracking-tight"
                    >
                      {t("discover.filter")}
                    </h2>
                    {activeCount > 0 && (
                      <p className="text-[11px] font-sans text-zinc-500 mt-0.5">
                        {t("discover.filtersActiveCount").replace("{{n}}", String(activeCount))}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="h-9 px-3 rounded-full text-xs font-sans font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-white/80 border border-transparent hover:border-zinc-200/80 transition-colors"
                  >
                    {t("discover.reset")}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-9 h-9 rounded-full flex items-center justify-center border border-zinc-200/70 bg-white/80 text-zinc-600 hover:bg-white hover:border-zinc-300 transition-colors shadow-sm"
                    aria-label={t("common.cancel")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-7">
                <section>
                  <label className="block font-display text-sm font-medium text-zinc-800 mb-2">
                    {t("discover.where")}
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      value={f.q}
                      onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))}
                      type="search"
                      enterKeyHint="search"
                      placeholder={t("discover.whereHolder")}
                      className={cn(
                        "w-full h-12 pl-11 pr-4 text-sm rounded-2xl border outline-none transition-shadow",
                        "bg-white/70 border-zinc-200/80 text-zinc-900 placeholder:text-zinc-400",
                        "focus:border-zinc-300 focus:ring-2 focus:ring-zinc-900/5"
                      )}
                    />
                  </div>
                </section>

                <section>
                  <label className="block font-display text-sm font-medium text-zinc-800 mb-2">
                    {t("discover.categories")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => {
                      const active = f.categories.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => toggleCat(cat.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 min-h-9 px-3.5 rounded-full text-xs font-sans font-semibold border transition-all active:scale-[0.98]",
                            active
                              ? "text-white border-transparent shadow-md"
                              : "text-zinc-700 bg-white/60 border-zinc-200/70 hover:bg-white hover:border-zinc-300/80"
                          )}
                          style={
                            active
                              ? {
                                  background: `linear-gradient(135deg, ${cat.color}ee, ${cat.color})`,
                                  boxShadow: `0 4px 14px ${cat.color}44`,
                                }
                              : undefined
                          }
                        >
                          <span className="text-[13px] leading-none">{cat.emoji}</span>
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <label className="block font-display text-sm font-medium text-zinc-800 mb-2">
                    {t("discover.arrondissement")}
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1 [scrollbar-width:thin]">
                    {ARRONDISSEMENTS.map((arr) => (
                      <button
                        key={arr}
                        type="button"
                        onClick={() =>
                          setF((p) => ({
                            ...p,
                            arrondissement: p.arrondissement === arr ? undefined : arr,
                          }))
                        }
                        className={cn(
                          "h-8 px-2.5 rounded-full text-[11px] font-sans font-semibold border transition-all",
                          f.arrondissement === arr
                            ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
                            : "bg-white/65 text-zinc-600 border-zinc-200/70 hover:border-zinc-300"
                        )}
                      >
                        {arr}
                      </button>
                    ))}
                  </div>
                </section>

                <section
                  className={cn(
                    "flex items-center justify-between gap-4 p-4 rounded-2xl border border-zinc-200/60",
                    "bg-white/50"
                  )}
                >
                  <span className="font-sans text-sm font-medium text-zinc-800">{t("discover.freeOnly")}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={f.freeOnly}
                    onClick={() => setF((p) => ({ ...p, freeOnly: !p.freeOnly }))}
                    className={cn(
                      "w-12 h-7 rounded-full transition-colors relative shrink-0 border border-black/5",
                      f.freeOnly ? "bg-zinc-900" : "bg-zinc-200/90"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all",
                        f.freeOnly ? "left-6" : "left-1"
                      )}
                    />
                  </button>
                </section>
              </div>

              <div className="relative shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 border-t border-zinc-200/50 bg-white/40 backdrop-blur-md">
                <button
                  type="button"
                  onClick={handleApply}
                  className={cn(
                    "w-full h-12 rounded-full text-sm font-sans font-semibold transition-all",
                    "bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.99]",
                    "shadow-[0_4px_20px_rgba(24,24,27,0.2)]"
                  )}
                >
                  {t("discover.applyFilters")}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
