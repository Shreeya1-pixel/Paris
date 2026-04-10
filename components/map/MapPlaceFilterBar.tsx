"use client";

import { cn } from "@/lib/utils";

export type NearbyPlaceFilter = "cafe" | "restaurant" | "bar" | "boulangerie";

const FILTERS: { id: NearbyPlaceFilter; label: string; emoji: string }[] = [
  { id: "cafe", label: "Café", emoji: "☕" },
  { id: "restaurant", label: "Restaurant", emoji: "🍽️" },
  { id: "bar", label: "Bar", emoji: "🍷" },
  { id: "boulangerie", label: "Bakery", emoji: "🥐" },
];

interface MapPlaceFilterBarProps {
  active: NearbyPlaceFilter[];
  onChange: (next: NearbyPlaceFilter[]) => void;
}

export function MapPlaceFilterBar({ active, onChange }: MapPlaceFilterBarProps) {
  const toggle = (id: NearbyPlaceFilter) => {
    if (active.includes(id)) {
      onChange(active.filter((x) => x !== id));
    } else {
      onChange([...active, id]);
    }
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pointer-events-auto py-1 px-1">
      {FILTERS.map((f) => {
        const on = active.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => toggle(f.id)}
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
    </div>
  );
}
