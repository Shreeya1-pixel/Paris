"use client";

import Image from "next/image";
import { Heart, MapPin, Clock } from "lucide-react";
import { motion } from "framer-motion";
import type { Event } from "@/types";
import { useLanguage } from "@/components/LanguageProvider";
import { CATEGORY_COLORS, CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface EventCardProps {
  event: Event;
  onClick?: () => void;
  onSave?: () => void;
  /** "landscape" = 280×180 horizontal scroll card
   *  "portrait"  = 160×220 2-col grid card
   *  "row"       = full-width compact row (icon+title+time+dist)
   *  "compact"   = small square (hidden gems grid)
   */
  variant?: "landscape" | "portrait" | "row" | "compact";
  index?: number;
  className?: string;
}

export function EventCard({
  event,
  onClick,
  onSave,
  variant = "portrait",
  index = 0,
  className,
}: EventCardProps) {
  const { t, formatEventTime, formatDistance, eventTitle, categoryLabel } = useLanguage();
  const title = eventTitle(event);
  const color = CATEGORY_COLORS[event.category] ?? "#C9A84C";
  const cat = CATEGORIES.find((c) => c.id === event.category);

  const handleSave = (e: React.MouseEvent) => { e.stopPropagation(); onSave?.(); };

  // ── Row variant (minimal full-width) ────────────────────────────────────────
  if (variant === "row") {
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
          {cat?.emoji ?? "✨"}
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
            <span className="text-[10px] px-2 py-0.5 rounded-full font-sans"
              style={{ background: `${color}22`, color }}>
              {t("common.free").replace("✨", "").trim()}
            </span>
          )}
          <button type="button" onClick={handleSave} aria-label={t("common.save")} className="w-8 h-8 flex items-center justify-center">
            <Heart className="w-4 h-4 transition-all"
              style={{ fill: event.is_saved ? color : "none", color: event.is_saved ? color : "var(--text-muted)" }} />
          </button>
        </div>
      </motion.article>
    );
  }

  // ── Compact (hidden gems square) ─────────────────────────────────────────────
  if (variant === "compact") {
    return (
      <motion.article
        whileHover={{ scale: 1.015 }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        className={cn("glass-card overflow-hidden cursor-pointer", className)}
      >
        <div className="relative w-full aspect-square" style={{ background: `${color}22` }}>
          {event.image_url ? (
            <Image src={event.image_url} alt={title} fill className="object-cover" sizes="(max-width:768px) 33vw, 150px" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-3xl">{cat?.emoji}</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <p className="absolute bottom-1.5 left-2 right-2 font-display text-xs text-white leading-tight line-clamp-2">
            {title}
          </p>
        </div>
      </motion.article>
    );
  }

  // ── Landscape (280×180 horizontal scroll) ────────────────────────────────────
  if (variant === "landscape") {
    return (
      <motion.article
        whileHover={{ scale: 1.015, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        style={{ animationDelay: `${index * 50}ms` }}
        className={cn("glass-card relative overflow-hidden cursor-pointer shrink-0 w-[280px] h-[180px]", className)}
      >
        {/* BG */}
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${color}30, ${color}60)` }} />
        {event.image_url && (
          <Image src={event.image_url} alt={title} fill className="object-cover opacity-90"
            sizes="280px" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Category pill OR rank label */}
        <div className="absolute top-3 left-3">
          {event.rank_label ? (
            <span className="flex items-center gap-1 text-xs font-sans font-medium px-2.5 py-1 rounded-full backdrop-blur-md"
              style={{ background: "rgba(201,168,76,0.25)", border: "1px solid rgba(201,168,76,0.4)", color: "#E8C96A" }}>
              ✦ {event.rank_label}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-sans font-medium px-2.5 py-1 rounded-full"
              style={{ background: `${color}dd`, color: "#fff" }}>
              {cat?.emoji} {categoryLabel(event.category)}
            </span>
          )}
        </div>

        {/* Save */}
        <button type="button" onClick={handleSave}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center" aria-label={t("common.save")}>
          <Heart className="w-3.5 h-3.5 transition-all"
            style={{ fill: event.is_saved ? "var(--accent-gold)" : "none", color: event.is_saved ? "var(--accent-gold)" : "white" }} />
        </button>

        {/* Bottom info */}
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

  // ── Portrait (2-col grid 160×220) ─────────────────────────────────────────────
  return (
    <motion.article
      whileHover={{ scale: 1.015, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{ animationDelay: `${index * 50}ms` }}
      className={cn("glass-card overflow-hidden cursor-pointer", className)}
    >
      <div className="relative w-full h-[120px]" style={{ background: `${color}22` }}>
        {event.image_url ? (
          <Image src={event.image_url} alt={title} fill className="object-cover"
            sizes="(max-width:768px) 50vw, 200px" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl"
            style={{ background: `linear-gradient(135deg, ${color}30, ${color}60)` }}>
            {cat?.emoji}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <button type="button" onClick={handleSave}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center" aria-label={t("common.save")}>
          <Heart className="w-3.5 h-3.5 transition-all"
            style={{ fill: event.is_saved ? "var(--accent-gold)" : "none", color: event.is_saved ? "var(--accent-gold)" : "white" }} />
        </button>
        {event.is_free && (
          <span className="absolute bottom-2 left-2 text-[10px] font-sans font-medium px-2 py-0.5 rounded-full"
            style={{ background: "#C9A84C", color: "#080B12" }}>
            {t("common.free").replace("✨", "").trim()}
          </span>
        )}
      </div>
      <div className="p-2.5">
        {event.rank_label && (
          <p className="text-[10px] font-sans font-medium mb-1 truncate"
            style={{ color: "var(--accent-gold)" }}>
            ✦ {event.rank_label}
          </p>
        )}
        <h3 className="font-display font-medium text-[var(--text-primary)] text-sm leading-snug line-clamp-2">{title}</h3>
        <p className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">
          {formatEventTime(event.start_time, event.end_time)}
        </p>
        {event.arrondissement && (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5" />{event.arrondissement}
          </p>
        )}
      </div>
    </motion.article>
  );
}
