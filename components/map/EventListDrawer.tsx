"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/components/LanguageProvider";
import { CATEGORY_COLORS, CATEGORIES } from "@/lib/constants";
import { Heart, ChevronDown } from "lucide-react";
import type { Event as ParisEvent } from "@/types";

interface EventListDrawerProps {
  events: ParisEvent[];
  onEventClick: (event: ParisEvent) => void;
  onSaveToggle: (event: ParisEvent) => void;
}

export function EventListDrawer({ events, onEventClick, onSaveToggle }: EventListDrawerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t, formatEventTime, eventTitle } = useLanguage();
  const constraintsRef = useRef<HTMLDivElement>(null);

  const peekHeight = 140;
  const expanded = "calc(100dvh - 168px - env(safe-area-inset-top, 0px) - 40px)";

  return (
    <motion.div
      ref={constraintsRef}
      className="absolute left-0 right-0 z-30 rounded-t-[24px] overflow-hidden bottom-[168px] md:bottom-[168px]"
      style={{
        background: "rgba(255,255,255,0.82)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.65)",
        borderBottomWidth: 0,
        boxShadow: "0 -8px 32px rgba(0,0,0,0.06)",
      }}
      animate={{ height: isExpanded ? expanded : `${peekHeight}px` }}
      transition={{ type: "spring", stiffness: 280, damping: 32 }}
    >
      {/* Drag handle / toggle */}
      <button
        type="button"
        className="w-full flex flex-col items-center pt-3 pb-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? "Collapse events" : "Expand events"}
      >
        <div className="w-10 h-1 rounded-full bg-zinc-300 mb-2" />
        <div className="flex items-center gap-2 text-sm">
          <span className="font-display font-medium text-zinc-900">
            {events.length} {events.length === 1 ? t("map.eventCount") : t("map.eventsCount")}
          </span>
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          </motion.div>
        </div>
      </button>

      {/* List */}
      <div className="overflow-y-auto h-[calc(100%-56px)] px-4 pb-4 space-y-2.5">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="font-display text-2xl text-zinc-900 mb-1">{t("map.nothingHere")}</p>
            <p className="text-sm text-zinc-500">{t("map.noEventsDesc")}</p>
          </div>
        ) : (
          events.map((event) => {
            const cat = CATEGORIES.find((c) => c.id === event.category);
            const color = CATEGORY_COLORS[event.category] ?? "#C9A84C";
            return (
              <motion.article
                key={event.id}
                role="button"
                tabIndex={0}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.18 }}
                onClick={() => onEventClick(event)}
                onKeyDown={(e) => e.key === "Enter" && onEventClick(event)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-[14px] border border-zinc-200/80 bg-white/60 backdrop-blur-sm transition-all duration-180 cursor-pointer hover:bg-white/90"
              >
                {/* Category dot */}
                <div
                  className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center text-lg"
                  style={{ background: `${color}22` }}
                >
                  {cat?.emoji ?? "✨"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-display font-medium text-zinc-900 text-sm leading-snug truncate">
                    {eventTitle(event)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                    {formatEventTime(event.start_time, event.end_time)}
                    {event.arrondissement && ` · ${event.arrondissement}`}
                  </p>
                </div>

                {/* Free badge + save */}
                <div className="shrink-0 flex items-center gap-2">
                  {event.is_free && (
                    <span className="text-[10px] font-sans font-medium px-2 py-0.5 rounded-full"
                      style={{ background: `${color}22`, color }}>
                      {t("common.free").replace("✨", "").trim()}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSaveToggle(event); }}
                    aria-label={event.is_saved ? "Unsave" : "Save"}
                    className="w-8 h-8 flex items-center justify-center"
                  >
                    <Heart
                      className="w-4 h-4 transition-all"
                      style={{
                        fill: event.is_saved ? "#18181b" : "none",
                        color: event.is_saved ? "#18181b" : "#a1a1aa",
                      }}
                    />
                  </button>
                </div>
              </motion.article>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
