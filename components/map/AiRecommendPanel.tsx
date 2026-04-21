"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, MapPin, Clock, Navigation } from "lucide-react";
import type { RecommendItem } from "@/lib/ai/recommendTypes";
import type { RecommendSource } from "@/hooks/useAiRecommend";
import { useLanguage } from "@/components/LanguageProvider";
import { CATEGORIES } from "@/lib/constants";
import { eventPlaceholderImage, placePlaceholderImage } from "@/lib/categoryImages";

interface AiRecommendPanelProps {
  items: RecommendItem[];
  message: string;
  source: RecommendSource | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onItemClick: (item: RecommendItem) => void;
}

function categoryEmoji(cat: string): string {
  const found = CATEGORIES.find((c) => c.id === cat);
  if (found) return found.emoji;
  const extras: Record<string, string> = {
    restaurant: "🍽️",
    bar: "🍷",
    cafe: "☕",
    club: "🌙",
    gallery: "🎨",
    park: "🌿",
    market: "🛍️",
    bookshop: "📚",
    boulangerie: "🥐",
    museum: "🏛️",
  };
  return extras[cat] ?? "📍";
}

function SourceBadge({ source }: { source: RecommendSource | null }) {
  if (!source) return null;
  const isAi = source === "ai";
  const label = isAi ? "AI picks" : "Nearby picks";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
        isAi
          ? "bg-amber-100 text-amber-700"
          : "bg-zinc-100 text-zinc-500"
      }`}
    >
      {isAi && <Sparkles className="w-2.5 h-2.5" />}
      {label}
    </span>
  );
}

export function AiRecommendPanel({
  items,
  message,
  source,
  loading,
  error,
  onClose,
  onItemClick,
}: AiRecommendPanelProps) {
  const { t } = useLanguage();
  const isVisible = loading || items.length > 0 || !!error;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="ai-panel"
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
          className="fixed left-0 right-0 z-[35] rounded-t-[22px] bg-white shadow-2xl"
          style={{
            /* Above bottom nav (~72px) + MapBottomChrome (input + tall chip row + gap) */
            bottom: "calc(212px + env(safe-area-inset-bottom, 0px))",
            maxHeight: "58dvh",
          }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-zinc-300" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="font-display font-semibold text-zinc-900 text-base truncate">
                {loading
                  ? t("map.aiLoading")
                  : message || t("map.aiSource")}
              </span>
              <SourceBadge source={source} />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-500 active:scale-95 transition-transform"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto px-4 py-3 space-y-2" style={{ maxHeight: "calc(58dvh - 88px)" }}>
            {loading && (
              <div className="flex justify-center py-10">
                <span className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {error && !loading && (
              <p className="text-sm text-red-500 text-center py-6">{error}</p>
            )}

            {!loading &&
              !error &&
              items.map((item) => {
                const imgSrc = item.image_url
                  ?? (item.type === "event"
                      ? eventPlaceholderImage(item.category)
                      : placePlaceholderImage(item.category));

                const directionsUrl =
                  item.lat != null && item.lng != null
                    ? `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}&destination_place_id=${encodeURIComponent(item.title)}`
                    : null;

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-zinc-200/60 overflow-hidden bg-zinc-50"
                  >
                    {/* Clickable main area */}
                    <button
                      type="button"
                      onClick={() => onItemClick(item)}
                      className="w-full text-left flex items-start gap-3 p-3 hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
                    >
                      {/* Thumbnail */}
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-zinc-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imgSrc}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display font-semibold text-zinc-900 text-sm leading-snug line-clamp-1">
                            {item.title}
                          </p>
                          {item.distance_km != null && (
                            <span className="shrink-0 text-[10px] font-sans text-zinc-400 mt-0.5 whitespace-nowrap">
                              {item.distance_km < 1
                                ? `${Math.round(item.distance_km * 1000)}m`
                                : `${item.distance_km.toFixed(1)} km`}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>

                        <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                          {item.type === "event" && item.start_time && (
                            <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                              <Clock className="w-2.5 h-2.5" />
                              {new Date(item.start_time).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                          {item.arrondissement && (
                            <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                              <MapPin className="w-2.5 h-2.5" />
                              {item.arrondissement}
                            </span>
                          )}
                          {item.is_free && (
                            <span className="text-[10px] text-emerald-600 font-medium">Free</span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-200/70 text-zinc-600 capitalize">
                            {item.type === "place" ? categoryEmoji(item.category) + " " + item.category : "✨ Event"}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Directions button — full-width strip at bottom */}
                    {directionsUrl && (
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-center gap-2 w-full py-2.5 border-t border-zinc-200/80 bg-white hover:bg-zinc-50 active:bg-zinc-100 transition-colors text-[12px] font-semibold text-zinc-700"
                      >
                        <Navigation className="w-3.5 h-3.5 text-blue-500" />
                        <span>Get Directions</span>
                      </a>
                    )}
                  </div>
                );
              })}

            {!loading && !error && items.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-8">
                {t("discover.empty")}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
