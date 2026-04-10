"use client";

import Image from "next/image";
import { Heart, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import type { Place } from "@/types";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  cafe:       "#C9A84C",
  restaurant: "#E8845A",
  bar:        "#9B3A4A",
  gallery:    "#2E8B6E",
  park:       "#4A7C59",
  market:     "#B07D3A",
  club:       "#5B4FC9",
  bookshop:   "#8B6914",
  boulangerie:"#C9A84C",
};

const CATEGORY_EMOJI: Record<string, string> = {
  cafe:       "☕",
  restaurant: "🍽️",
  bar:        "🍷",
  gallery:    "🎨",
  park:       "🌿",
  market:     "🛍️",
  club:       "🌙",
  bookshop:   "📚",
  boulangerie:"🥐",
};

interface PlaceCardProps {
  place: Place;
  onClick?: () => void;
  onSave?: () => void;
  variant?: "card" | "compact" | "row";
  index?: number;
  className?: string;
}

export function PlaceCard({ place, onClick, onSave, variant = "card", index = 0, className }: PlaceCardProps) {
  const color = CATEGORY_COLORS[place.category] ?? "#C9A84C";
  const emoji = CATEGORY_EMOJI[place.category] ?? "📍";

  const handleSave = (e: React.MouseEvent) => { e.stopPropagation(); onSave?.(); };

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
        className={cn("glass-card flex items-center gap-3 p-3 cursor-pointer", className)}
      >
        <div
          className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center text-lg"
          style={{ background: `${color}22` }}
        >
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-medium text-[var(--text-primary)] text-sm truncate">{place.name}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
            {place.arrondissement}
            {dist && ` · ${dist}`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          aria-label="Save"
          className="shrink-0 w-8 h-8 flex items-center justify-center"
        >
          <Heart
            className="w-4 h-4 transition-all"
            style={{
              fill: place.is_saved ? color : "none",
              color: place.is_saved ? color : "var(--text-muted)",
            }}
          />
        </button>
      </motion.article>
    );
  }

  if (variant === "compact") {
    return (
      <motion.article
        whileHover={{ scale: 1.015 }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        className={cn("glass-card overflow-hidden cursor-pointer", className)}
      >
        <div className="relative w-full aspect-square" style={{ background: `${color}22` }}>
          {place.image_url ? (
            <Image src={place.image_url} alt={place.name} fill className="object-cover"
              sizes="(max-width:768px) 33vw,150px" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-3xl">{emoji}</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <p className="absolute bottom-1.5 left-2 right-2 font-display text-xs text-white leading-tight line-clamp-2">
            {place.name}
          </p>
        </div>
      </motion.article>
    );
  }

  // Full card — 180×240px
  return (
    <motion.article
      whileHover={{ scale: 1.015, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{ animationDelay: `${index * 50}ms`, width: "180px", flexShrink: 0 }}
      className={cn("glass-card overflow-hidden cursor-pointer flex flex-col", className)}
    >
      {/* Image */}
      <div className="relative w-full h-[120px] shrink-0" style={{ background: `${color}22` }}>
        {place.image_url ? (
          <Image src={place.image_url} alt={place.name} fill className="object-cover" sizes="180px" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl"
            style={{ background: `linear-gradient(135deg, ${color}30, ${color}60)` }}>
            {emoji}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

        {/* Save */}
        <button type="button" onClick={handleSave}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center" aria-label="Save">
          <Heart className="w-3.5 h-3.5 transition-all"
            style={{ fill: place.is_saved ? "var(--accent-gold)" : "none", color: place.is_saved ? "var(--accent-gold)" : "white" }} />
        </button>

        {/* Featured star */}
        {place.is_featured && (
          <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-sans font-medium"
            style={{ background: "var(--accent-gold)", color: "var(--bg-base)" }}>
            ★
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <h3 className="font-display font-medium text-[var(--text-primary)] text-sm leading-snug line-clamp-2">{place.name}</h3>
        <div className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
          <MapPin className="w-2.5 h-2.5 shrink-0" />{place.arrondissement}
          {place.price_range && <span className="ml-1 text-[var(--accent-gold)]">{place.price_range}</span>}
        </div>
        {place.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {place.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: `${color}22`, color }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.article>
  );
}
