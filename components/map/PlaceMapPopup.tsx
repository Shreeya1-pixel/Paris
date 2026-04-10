"use client";

import Image from "next/image";
import type { Place } from "@/types";

const CAT_EMOJI: Record<string, string> = {
  cafe: "☕",
  restaurant: "🍽️",
  bar: "🍷",
  boulangerie: "🥐",
  gallery: "🖼️",
  park: "🌳",
  market: "🛍️",
  club: "🌙",
  bookshop: "📚",
};

interface PlaceMapPopupProps {
  place: Place;
  onOpenDetail?: () => void;
}

export function PlaceMapPopup({ place, onOpenDetail }: PlaceMapPopupProps) {
  const emoji = CAT_EMOJI[place.category] ?? "📍";

  return (
    <div className="w-[220px] max-w-[min(220px,70vw)] rounded-2xl overflow-hidden border border-white/25 shadow-2xl bg-zinc-900/92 backdrop-blur-xl text-left">
      {place.image_url && (
        <div className="relative h-20 w-full">
          <Image src={place.image_url} alt="" fill className="object-cover" sizes="220px" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent" />
        </div>
      )}
      <div className="p-2.5 pt-2">
        <p className="text-[10px] font-sans font-semibold uppercase tracking-wide text-amber-200/90 mb-0.5">
          {emoji} {place.category}
        </p>
        <h3 className="font-display text-sm font-semibold text-white leading-tight line-clamp-2">{place.name}</h3>
        {place.description && (
          <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-snug">{place.description}</p>
        )}
        <p className="text-[10px] text-zinc-500 mt-1.5">{place.arrondissement}</p>
        {onOpenDetail && (
          <button
            type="button"
            onClick={onOpenDetail}
            className="mt-2 w-full py-1.5 rounded-xl text-[11px] font-sans font-medium bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
          >
            Details
          </button>
        )}
      </div>
    </div>
  );
}
