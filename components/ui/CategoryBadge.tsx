"use client";

import { cn } from "@/lib/utils";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import type { ParisCategory } from "@/types";

interface CategoryBadgeProps {
  category: ParisCategory | string;
  size?: "sm" | "md";
  className?: string;
}

export function CategoryBadge({ category, size = "md", className }: CategoryBadgeProps) {
  const cat = CATEGORIES.find((c) => c.id === category);
  const color = CATEGORY_COLORS[category] ?? "#C9A84C";
  const emoji = cat?.emoji ?? "✨";
  const label = cat?.label ?? category;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-sans font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className
      )}
      style={{ background: `${color}22`, color }}
    >
      <span>{emoji}</span>
      <span>{label}</span>
    </span>
  );
}
