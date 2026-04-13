"use client";

import { useState } from "react";
import type { Place, PlaceCategory } from "@/types";

const CAT_EMOJI: Record<PlaceCategory, string> = {
  cafe: "☕",
  restaurant: "🍽️",
  bar: "🍷",
  boulangerie: "🥐",
  gallery: "🖼️",
  park: "🌳",
  library: "📖",
  market: "🛍️",
  club: "🌙",
  bookshop: "📚",
};

const DOT_COLOR: Record<PlaceCategory, string> = {
  cafe: "#ea580c",
  restaurant: "#db2777",
  bar: "#7c3aed",
  boulangerie: "#ca8a04",
  gallery: "#0891b2",
  park: "#16a34a",
  library: "#2563eb",
  market: "#c026d3",
  club: "#4f46e5",
  bookshop: "#0d9488",
};

interface PlaceMapLabelProps {
  place: Place;
  expanded: boolean;
  selected?: boolean;
  pulsing?: boolean;
}

export function PlaceMapLabel({
  place,
  expanded,
  selected = false,
  pulsing = false,
}: PlaceMapLabelProps) {
  const [hovered, setHovered] = useState(false);
  const dotColor = DOT_COLOR[place.category] ?? "#c9a84c";
  const emoji = CAT_EMOJI[place.category] ?? "📍";
  const dotPx = selected ? 12 : 9;
  const isActive = selected || pulsing || hovered;

  const dot = (
    <div
      className={`rounded-full border-2 border-white shrink-0 ${pulsing ? "animate-pulse" : ""}`}
      style={{
        width: dotPx,
        height: dotPx,
        background: dotColor,
        boxShadow: selected
          ? `0 0 0 3px ${dotColor}44, 0 2px 6px rgba(0,0,0,0.22)`
          : "0 1px 4px rgba(0,0,0,0.2)",
      }}
      aria-hidden
    />
  );

  /* ── Compact dot (zoomed out) ── */
  if (!expanded) {
    return (
      <div
        className="relative cursor-pointer touch-manipulation"
        style={{
          width: dotPx + 8,
          height: dotPx + 8,
          transform: hovered ? "scale(1.5)" : "scale(1)",
          transition: "transform 0.15s ease",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-hidden
      >
        <div className="absolute inset-0 flex items-center justify-center">{dot}</div>
      </div>
    );
  }

  /* ── Expanded label: dot + emoji bubble + name only ── */
  return (
    <div
      className="relative flex items-center cursor-pointer touch-manipulation"
      style={{
        transform: hovered ? "scale(1.05) translateY(-1px)" : "scale(1)",
        transition: "transform 0.18s ease",
        filter: isActive
          ? `drop-shadow(0 4px 14px ${dotColor}55)`
          : "drop-shadow(0 2px 8px rgba(0,0,0,0.1))",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-hidden
    >
      {/* Category dot — anchored at the map coordinate */}
      <div
        className="absolute shrink-0"
        style={{ left: 0, top: "50%", transform: "translate(-50%,-50%)" }}
      >
        {dot}
      </div>

      {/* Emoji bubble + name */}
      <div className="flex items-center gap-1.5 pl-3">
        {/* Emoji circle */}
        <div
          className="rounded-full bg-white flex items-center justify-center shrink-0"
          style={{
            width: 40,
            height: 40,
            fontSize: 19,
            lineHeight: 1,
            boxShadow: isActive
              ? `0 4px 16px rgba(0,0,0,0.18), 0 0 0 2px ${dotColor}44`
              : "0 3px 10px rgba(0,0,0,0.13)",
            border: `1.5px solid ${isActive ? dotColor + "55" : "rgba(0,0,0,0.06)"}`,
            transition: "box-shadow 0.18s, border-color 0.18s",
          }}
        >
          {emoji}
        </div>

        {/* Name only — no description */}
        <span
          className="font-sans font-semibold leading-tight whitespace-nowrap"
          style={{
            fontSize: 12.5,
            color: "#111827",
            letterSpacing: "-0.01em",
            textShadow:
              "0 1px 0 rgba(255,255,255,0.98), 0 -1px 0 rgba(255,255,255,0.9), 1px 0 0 rgba(255,255,255,0.9), -1px 0 0 rgba(255,255,255,0.9)",
            maxWidth: "min(140px, 40vw)",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {place.name}
        </span>
      </div>
    </div>
  );
}
