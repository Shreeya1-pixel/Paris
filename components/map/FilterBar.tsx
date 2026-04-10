"use client";

import { useRef } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import type { ParisCategory } from "@/types";
import { CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  activeCategory: ParisCategory | null;
  onCategoryChange: (category: ParisCategory | null) => void;
  /** overlay = old top map chips; dock = bottom light pills (reference UI) */
  variant?: "overlay" | "dock";
}

export function FilterBar({
  activeCategory,
  onCategoryChange,
  variant = "overlay",
}: FilterBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t, categoryLabel } = useLanguage();

  const isDock = variant === "dock";

  return (
    <div
      className={cn(
        isDock ? "w-full" : "absolute top-[108px] left-0 right-0 z-20 px-4 pointer-events-none"
      )}
    >
      <div
        ref={scrollRef}
        className={cn(
          "flex gap-2 overflow-x-auto scrollbar-hide",
          !isDock && "pointer-events-auto",
          isDock && "pb-0.5"
        )}
      >
        <button
          type="button"
          onClick={() => onCategoryChange(null)}
          className={cn(
            "shrink-0 h-10 px-4 rounded-2xl text-xs font-semibold transition-all duration-200 border",
            isDock
              ? activeCategory === null
                ? "bg-zinc-800 text-white border-zinc-800 shadow-md"
                : "bg-zinc-100/90 text-zinc-600 border-zinc-200/80 backdrop-blur-sm"
              : activeCategory === null
                ? "bg-[var(--accent-gold)] text-white border-transparent"
                : "border-[var(--bg-glass-border)] text-[var(--text-secondary)] bg-[var(--bg-glass)] backdrop-blur-md"
          )}
        >
          {t("common.all")}
        </button>

        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onCategoryChange(cat.id)}
            className={cn(
              "shrink-0 h-10 px-3.5 rounded-2xl text-xs font-semibold transition-all duration-200 border flex items-center gap-1.5",
              isDock
                ? activeCategory === cat.id
                  ? "bg-zinc-800 text-white border-zinc-800 shadow-md"
                  : "bg-zinc-100/90 text-zinc-600 border-zinc-200/80 backdrop-blur-sm"
                : activeCategory === cat.id
                  ? "text-white border-transparent"
                  : "border-[var(--bg-glass-border)] text-[var(--text-secondary)] bg-[var(--bg-glass)] backdrop-blur-md"
            )}
            style={
              !isDock && activeCategory === cat.id ? { background: cat.color } : undefined
            }
          >
            <span>{cat.emoji}</span>
            <span>{categoryLabel(cat.id)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
