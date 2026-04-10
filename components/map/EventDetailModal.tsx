"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Share2, MapPin, Calendar, X, Users, ExternalLink } from "lucide-react";
import type { Event } from "@/types";
import { useLanguage } from "@/components/LanguageProvider";
import { CATEGORY_COLORS, CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface EventDetailModalProps {
  event: Event | null;
  userLat?: number;
  userLng?: number;
  onClose: () => void;
  onSaveToggle?: () => void;
  onAttend?: () => void;
}

export function EventDetailModal({
  event,
  userLat = 48.8566,
  userLng = 2.3522,
  onClose,
  onSaveToggle,
  onAttend,
}: EventDetailModalProps) {
  const {
    t,
    formatEventTime,
    formatDistance,
    eventTitle,
    eventDescription,
    categoryLabel,
    vibeLabel,
  } = useLanguage();
  const pathname = usePathname();
  const onMap = pathname === "/map";
  const navOffset = onMap ? "0px" : "72px";

  if (!event) return null;

  const title = eventTitle(event);
  const description = eventDescription(event);

  const color = CATEGORY_COLORS[event.category] ?? "#C9A84C";
  const cat = CATEGORIES.find((c) => c.id === event.category);
  const distance =
    event.distance_km ??
    Math.sqrt(
      Math.pow((event.lat - userLat) * 111, 2) +
      Math.pow((event.lng - userLng) * 85, 2)
    );

  const handleShare = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({
        title,
        text: description ?? title,
        url: window.location.href,
      });
    }
  };

  return (
    <AnimatePresence>
      {/* Backdrop z:40 */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel z:50 */}
      <motion.div
        key="panel"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className="fixed left-0 right-0 z-50 overflow-y-auto rounded-t-[24px] bg-white/95 backdrop-blur-xl border border-white/60 border-b-0 shadow-2xl"
        style={{
          bottom: navOffset,
          maxHeight: `calc(100dvh - ${navOffset} - env(safe-area-inset-top, 0px) - 12px)`,
        }}
      >
        {/* Hero image */}
        <div className="relative w-full h-52 shrink-0" style={{ background: `${color}22` }}>
          {event.image_url ? (
            <Image src={event.image_url} alt={title} fill className="object-cover" />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center text-6xl"
              style={{ background: `linear-gradient(135deg, ${color}30, ${color}60)` }}
            >
              {cat?.emoji}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-surface)] via-transparent to-transparent" />

          {/* Controls */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            aria-label={t("map.close")}
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              aria-label={t("map.share")}
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onSaveToggle}
              className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors"
              aria-label={event.is_saved ? t("map.unsave") : t("map.save")}
            >
              <Heart
                className="w-4 h-4 transition-all duration-200"
                style={{
                  fill: event.is_saved ? "var(--accent-gold)" : "none",
                  color: event.is_saved ? "var(--accent-gold)" : "white",
                }}
              />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 pb-8 -mt-2 relative z-10">
          {/* Category + vibe tags */}
          <div className="flex flex-wrap gap-2 mb-3">
            <span
              className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-sans font-medium"
              style={{ background: `${color}22`, color }}
            >
              {cat?.emoji} {categoryLabel(event.category)}
            </span>
            {event.arrondissement && (
              <span className="px-3 py-1 rounded-full text-xs font-sans text-[var(--text-secondary)] bg-[var(--bg-glass)] border border-[var(--bg-glass-border)]">
                {event.arrondissement}
              </span>
            )}
            {event.vibe_tags.slice(0, 2).map((v) => (
              <span key={v} className="px-3 py-1 rounded-full text-xs font-sans text-[var(--text-secondary)] bg-[var(--bg-glass)] border border-[var(--bg-glass-border)]">
                {vibeLabel(v)}
              </span>
            ))}
          </div>

          <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)] leading-tight mb-3">
            {title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap gap-4 mb-4 text-sm text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 shrink-0" />
              {formatEventTime(event.start_time, event.end_time)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 shrink-0" />
              {formatDistance(distance)}
            </span>
            {event.attendee_count > 0 && (
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 shrink-0" />
                {t("map.goingCount").replace("{{n}}", String(event.attendee_count))}
              </span>
            )}
          </div>

          {/* Description */}
          {description && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">
              {description}
            </p>
          )}

          {/* Location */}
          {event.location_name && (
            <div className="flex items-start gap-2.5 mb-5 p-3 rounded-[12px] bg-[var(--bg-glass)] border border-[var(--bg-glass-border)]">
              <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-gold)]" />
              <div>
                <p className="font-sans font-medium text-[var(--text-primary)] text-sm">{event.location_name}</p>
                {event.address && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{event.address}</p>}
              </div>
            </div>
          )}

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            {event.ticket_url ? (
              <a
                href={event.ticket_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-[120px] h-12 rounded-pill flex items-center justify-center gap-2 text-sm font-sans font-medium text-[var(--bg-base)] transition-colors"
                style={{ background: "var(--accent-gold)" }}
              >
                <ExternalLink className="w-4 h-4" />
                {t("map.getTickets")}
              </a>
            ) : (
              <span
                className="h-12 px-5 rounded-pill flex items-center text-sm font-sans font-medium"
                style={{ background: `${color}22`, color }}
              >
                {t("common.free")}
              </span>
            )}
            <button
              type="button"
              onClick={onAttend}
              className={cn(
                "flex-1 min-w-[120px] h-12 rounded-pill text-sm font-sans font-medium border transition-all",
                event.is_attending
                  ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)] text-[var(--accent-gold)]"
                  : "bg-[var(--bg-glass)] border-[var(--bg-glass-border)] text-[var(--text-primary)] hover:border-[var(--accent-gold)]"
              )}
            >
              {event.is_attending ? t("map.imComingCheck") : t("map.imComing")}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
