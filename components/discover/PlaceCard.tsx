"use client";

import Image from "next/image";
import { Bookmark } from "lucide-react";
import { motion } from "framer-motion";
import type { Place } from "@/types";
import { cn } from "@/lib/utils";
import { placePlaceholderImage } from "@/lib/categoryImages";

const CATEGORY_COLORS: Record<string, string> = {
  cafe:        "#C9A84C",
  restaurant:  "#E8845A",
  bar:         "#9B3A4A",
  gallery:     "#2E8B6E",
  park:        "#4A7C59",
  market:      "#B07D3A",
  club:        "#5B4FC9",
  bookshop:    "#8B6914",
  boulangerie: "#C9A84C",
};

const CATEGORY_EMOJI: Record<string, string> = {
  cafe:        "☕",
  restaurant:  "🍽️",
  bar:         "🍷",
  gallery:     "🎨",
  park:        "🌿",
  market:      "🛍️",
  club:        "🌙",
  bookshop:    "📚",
  boulangerie: "🥐",
};

interface PlaceCardProps {
  place: Place;
  onClick?: () => void;
  onSave?: () => void;
  variant?: "card" | "compact" | "row";
  index?: number;
  className?: string;
}

function SaveBtn({
  saved,
  onSave,
  size = "md",
}: {
  saved: boolean;
  onSave: (e: React.MouseEvent) => void;
  size?: "sm" | "md";
}) {
  const sz = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  return (
    <button
      type="button"
      onClick={onSave}
      aria-label={saved ? "Unsave" : "Save"}
      className={cn(
        sz,
        "rounded-full flex items-center justify-center transition-all",
        saved
          ? "bg-[var(--accent-gold)] shadow-md"
          : "bg-black/40 backdrop-blur-sm hover:bg-black/60"
      )}
    >
      <Bookmark
        className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"}
        style={{
          fill: saved ? "white" : "none",
          color: "white",
          strokeWidth: 2,
        }}
      />
    </button>
  );
}

export function PlaceCard({
  place,
  onClick,
  onSave,
  variant = "card",
  index = 0,
  className,
}: PlaceCardProps) {
  const color = CATEGORY_COLORS[place.category] ?? "#C9A84C";
  const emoji = CATEGORY_EMOJI[place.category] ?? "📍";
  const imgSrc = place.image_url || placePlaceholderImage(place.category);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSave?.();
  };

  // ── Row variant ──────────────────────────────────────────────────────────────
  if (variant === "row") {
    const dist =
      place.distance_km != null
        ? place.distance_km < 1
          ? `${Math.round(place.distance_km * 1000)}m`
          : `${place.distance_km.toFixed(1)} km`
        : null;
    return (
      <motion.article
        whileHover={{ scale: 1.012 }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        style={{ animationDelay: `${index * 50}ms` }}
        className={cn("glass-card flex items-center gap-3 p-3 cursor-pointer overflow-hidden", className)}
      >
        <div className="relative shrink-0 w-12 h-12 rounded-[10px] overflow-hidden">
          <Image src={imgSrc} alt={place.name} fill className="object-cover" sizes="48px" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-medium text-[var(--text-primary)] text-sm truncate">{place.name}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
            {place.arrondissement}
            {dist && ` · ${dist}`}
          </p>
        </div>
        {onSave && (
          <SaveBtn saved={!!place.is_saved} onSave={handleSave} size="sm" />
        )}
      </motion.article>
    );
  }

  // ── Compact ──────────────────────────────────────────────────────────────────
  if (variant === "compact") {
    return (
      <motion.article
        whileHover={{ scale: 1.015 }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        className={cn("glass-card overflow-hidden cursor-pointer", className)}
      >
        <div className="relative w-full aspect-square">
          <Image
            src={imgSrc}
            alt={place.name}
            fill
            className="object-cover"
            sizes="(max-width:768px) 33vw, 150px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <p className="absolute bottom-1.5 left-2 right-2 font-display text-xs text-white leading-tight line-clamp-2">
            {place.name}
          </p>
        </div>
      </motion.article>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────────────
  return (
    <motion.article
      whileHover={{ scale: 1.015, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{ animationDelay: `${index * 50}ms`, width: "180px", flexShrink: 0 }}
      className={cn("glass-card overflow-hidden cursor-pointer flex flex-col", className)}
    >
      <div className="relative w-full h-[120px] shrink-0">
        <Image src={imgSrc} alt={place.name} fill className="object-cover" sizes="180px" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        {onSave && (
          <div className="absolute top-2 right-2">
            <SaveBtn saved={!!place.is_saved} onSave={handleSave} />
          </div>
        )}

        {place.is_featured && (
          <span
            className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-sans font-semibold"
            style={{ background: "var(--accent-gold)", color: "var(--bg-base)" }}
          >
            ★ Featured
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-1 flex-1">
        <h3 className="font-display font-medium text-[var(--text-primary)] text-sm leading-snug line-clamp-2">
          {place.name}
        </h3>
        <div className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
          <span className="text-base leading-none">{emoji}</span>
          <span className="truncate">{place.arrondissement}</span>
          {place.price_range && (
            <span className="ml-auto text-[var(--accent-gold)] shrink-0">{place.price_range}</span>
          )}
        </div>
        {place.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {place.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: `${color}22`, color }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.article>
  );
}
