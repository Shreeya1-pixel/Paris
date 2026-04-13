"use client";

import Image from "next/image";
import { Bookmark, MapPin, Clock } from "lucide-react";
import { motion } from "framer-motion";
import type { Event } from "@/types";
import { useLanguage } from "@/components/LanguageProvider";
import { CATEGORY_COLORS, CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { eventPlaceholderImage } from "@/lib/categoryImages";

interface EventCardProps {
  event: Event;
  onClick?: () => void;
  onSave?: () => void;
  variant?: "landscape" | "portrait" | "row" | "compact";
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
          color: saved ? "white" : "white",
          strokeWidth: 2,
        }}
      />
    </button>
  );
}

export function EventCard({
  event,
  onClick,
  onSave,
  variant = "portrait",
  index = 0,
  className,
}: EventCardProps) {
  const { formatEventTime, formatDistance, eventTitle, categoryLabel } = useLanguage();
  const title = eventTitle(event);
  const color = CATEGORY_COLORS[event.category] ?? "#C9A84C";
  const cat = CATEGORIES.find((c) => c.id === event.category);
  const imgSrc = event.image_url || eventPlaceholderImage(event.category);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSave?.();
  };

  // ── Row variant ──────────────────────────────────────────────────────────────
  if (variant === "row") {
    return (
      <motion.article
        whileHover={{ scale: 1.012 }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        style={{ animationDelay: `${index * 50}ms` }}
        className={cn("glass-card flex items-center gap-3 p-3 cursor-pointer overflow-hidden", className)}
      >
        {/* Thumbnail */}
        <div className="relative shrink-0 w-12 h-12 rounded-[10px] overflow-hidden">
          <Image
            src={imgSrc}
            alt={title}
            fill
            className="object-cover"
            sizes="48px"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-medium text-[var(--text-primary)] text-sm truncate">{title}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
            {formatEventTime(event.start_time, event.end_time)}
            {event.distance_km != null && ` · ${formatDistance(event.distance_km)}`}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {event.is_free && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-sans"
              style={{ background: `${color}22`, color }}
            >
              Free
            </span>
          )}
          {onSave && (
            <SaveBtn saved={!!event.is_saved} onSave={handleSave} size="sm" />
          )}
        </div>
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
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width:768px) 33vw, 150px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <p className="absolute bottom-1.5 left-2 right-2 font-display text-xs text-white leading-tight line-clamp-2">
            {title}
          </p>
        </div>
      </motion.article>
    );
  }

  // ── Landscape ────────────────────────────────────────────────────────────────
  if (variant === "landscape") {
    return (
      <motion.article
        whileHover={{ scale: 1.015, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        style={{ animationDelay: `${index * 50}ms` }}
        className={cn("glass-card relative overflow-hidden cursor-pointer shrink-0 w-[280px] h-[180px]", className)}
      >
        <Image src={imgSrc} alt={title} fill className="object-cover" sizes="280px" priority={index === 0} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        {/* Category pill */}
        <div className="absolute top-3 left-3">
          {event.rank_label ? (
            <span
              className="flex items-center gap-1 text-xs font-sans font-medium px-2.5 py-1 rounded-full backdrop-blur-md"
              style={{ background: "rgba(201,168,76,0.25)", border: "1px solid rgba(201,168,76,0.4)", color: "#E8C96A" }}
            >
              ✦ {event.rank_label}
            </span>
          ) : (
            <span
              className="flex items-center gap-1 text-xs font-sans font-medium px-2.5 py-1 rounded-full"
              style={{ background: `${color}dd`, color: "#fff" }}
            >
              {cat?.emoji} {categoryLabel(event.category)}
            </span>
          )}
        </div>

        {onSave && (
          <div className="absolute top-3 right-3">
            <SaveBtn saved={!!event.is_saved} onSave={handleSave} />
          </div>
        )}

        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="font-display font-semibold text-white text-base leading-tight line-clamp-2">{title}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock className="w-3 h-3 text-[var(--accent-gold-light)]" />
            <span className="text-xs text-[var(--accent-gold-light)]">
              {formatEventTime(event.start_time, event.end_time)}
            </span>
            {event.arrondissement && (
              <span className="text-xs text-white/60 ml-1">· {event.arrondissement}</span>
            )}
          </div>
        </div>
      </motion.article>
    );
  }

  // ── Portrait (2-col grid) ─────────────────────────────────────────────────────
  return (
    <motion.article
      whileHover={{ scale: 1.015, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{ animationDelay: `${index * 50}ms` }}
      className={cn("glass-card overflow-hidden cursor-pointer", className)}
    >
      <div className="relative w-full h-[130px]">
        <Image
          src={imgSrc}
          alt={title}
          fill
          className="object-cover"
          sizes="(max-width:768px) 50vw, 200px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        {onSave && (
          <div className="absolute top-2 right-2">
            <SaveBtn saved={!!event.is_saved} onSave={handleSave} />
          </div>
        )}

        {event.is_free && (
          <span
            className="absolute bottom-2 left-2 text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full"
            style={{ background: "#C9A84C", color: "#080B12" }}
          >
            Free
          </span>
        )}
      </div>
      <div className="p-2.5">
        {event.rank_label && (
          <p className="text-[10px] font-sans font-medium mb-1 truncate" style={{ color: "var(--accent-gold)" }}>
            ✦ {event.rank_label}
          </p>
        )}
        <h3 className="font-display font-medium text-[var(--text-primary)] text-sm leading-snug line-clamp-2">
          {title}
        </h3>
        <p className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">
          {formatEventTime(event.start_time, event.end_time)}
        </p>
        {event.arrondissement && (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5" />
            {event.arrondissement}
          </p>
        )}
      </div>
    </motion.article>
  );
}
