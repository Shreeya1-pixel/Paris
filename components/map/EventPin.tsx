"use client";

import type { Event } from "@/types";
import { CATEGORIES } from "@/lib/constants";
import { truncate } from "@/lib/utils";
import { useLanguage } from "@/components/LanguageProvider";

interface EventPinProps {
  event: Event;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * Reference UI: floating pill tooltip + concentric rings + pin dot.
 */
export function EventPin({ event, isSelected, onClick }: EventPinProps) {
  const { eventTitle, categoryLabel } = useLanguage();
  const displayTitle = eventTitle(event);
  const categoryConfig = CATEGORIES.find((c) => c.id === event.category);
  const emoji = categoryConfig?.emoji ?? "🎉";
  const shortLabel = categoryLabel(event.category);
  const titleBit = truncate(displayTitle, 10);
  const plus =
    event.attendee_count > 0 ? ` +${event.attendee_count}` : "";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="flex flex-col items-center cursor-pointer select-none"
      style={{
        transform: isSelected ? "scale(1.08)" : "scale(1)",
        transition: "transform 0.2s ease",
        filter: isSelected ? "drop-shadow(0 4px 12px rgba(0,0,0,0.2))" : undefined,
      }}
    >
      {/* Tooltip pill */}
      <div className="relative z-10 mb-0.5">
        <div
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800 text-white text-[11px] font-semibold shadow-md whitespace-nowrap max-w-[140px]"
        >
          <span>{emoji}</span>
          <span className="truncate">{titleBit || shortLabel}</span>
          {plus && <span className="text-zinc-300 font-medium">{plus}</span>}
        </div>
        <div
          className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-zinc-800"
          aria-hidden
        />
      </div>

      {/* Rings + pin */}
      <div className="relative flex items-center justify-center w-[52px] h-[52px] -mt-0.5">
        <div
          className="absolute rounded-full bg-zinc-400/25"
          style={{ width: 48, height: 48 }}
        />
        <div
          className="absolute rounded-full bg-zinc-400/20"
          style={{ width: 36, height: 36 }}
        />
        <div className="relative z-10 w-[30px] h-[30px] rounded-full bg-white border-[3px] border-white shadow-[0_2px_8px_rgba(0,0,0,0.12)] flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-900" />
        </div>
      </div>
    </div>
  );
}
