"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  MapPin,
  Clock,
  Heart,
  ExternalLink,
  Instagram,
  Navigation,
  Share2,
} from "lucide-react";
import type { Place } from "@/types";
import { useLanguage } from "@/components/LanguageProvider";
import { haversineKm } from "@/lib/geo";

interface PlaceDetailSheetProps {
  place: Place | null;
  userLat?: number;
  userLng?: number;
  onClose: () => void;
  onSave?: () => void;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const MAPBOX = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

export function PlaceDetailSheet({
  place,
  userLat = 48.8566,
  userLng = 2.3522,
  onClose,
  onSave,
}: PlaceDetailSheetProps) {
  const { t } = useLanguage();
  const [tagline, setTagline] = useState("");
  const [quote, setQuote] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState(false);

  const distanceKm =
    place?.distance_km ?? (place ? haversineKm(userLat, userLng, place.lat, place.lng) : 0);

  const loadInsight = useCallback(async (p: Place) => {
    setInsightLoading(true);
    setInsightError(false);
    setTagline("");
    setQuote("");
    try {
      const res = await fetch("/api/places/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          category: p.category,
          description: p.description,
          tags: p.tags,
          arrondissement: p.arrondissement,
        }),
      });
      const data = (await res.json()) as { tagline?: string; quote?: string };
      if (!res.ok) throw new Error("insight");
      setTagline(data.tagline ?? "");
      setQuote(data.quote ?? "");
    } catch {
      setInsightError(true);
    } finally {
      setInsightLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!place) return;
    void loadInsight(place);
  }, [place?.id, loadInsight, place]);

  const handleShare = useCallback(async () => {
    if (!place) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: place.name, text: place.description ?? place.name, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* ignore */
    }
  }, [place]);

  const directionsUrl = place
    ? `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`
    : "";

  const staticMapUrl =
    place && MAPBOX.trim()
      ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+111827(${place.lng},${place.lat})/${place.lng},${place.lat},14,0/400x200@2x?access_token=${encodeURIComponent(MAPBOX)}`
      : null;

  if (!place) return null;

  const categoryLabel =
    place.category.charAt(0).toUpperCase() + place.category.slice(1).replace(/-/g, " ");

  return (
    <AnimatePresence>
      <motion.div
        key="bd"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/70"
        onClick={onClose}
      />

      <motion.div
        key="sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className="fixed left-0 right-0 bottom-[72px] z-50 max-h-[calc(100dvh-72px-env(safe-area-inset-top,0px)-16px)] overflow-y-auto rounded-t-[22px] bg-white shadow-2xl"
      >
        <div className="relative w-full h-52 shrink-0">
          {place.image_url ? (
            <Image
              src={place.image_url}
              alt={place.name}
              fill
              className="object-cover"
              sizes="100vw"
              priority
            />
          ) : (
            <div className="absolute inset-0 bg-[var(--bg-glass)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />

          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="absolute top-4 right-14 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white"
            aria-label="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onSave}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center"
            aria-label="Save"
          >
            <Heart
              className="w-4 h-4 transition-all"
              style={{
                fill: place.is_saved ? "var(--accent-gold)" : "none",
                color: place.is_saved ? "var(--accent-gold)" : "white",
              }}
            />
          </button>
        </div>

        <div className="px-5 py-4 pb-10 space-y-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-zinc-900">{place.name}</h2>
            {tagline ? (
              <p className="text-sm text-zinc-500 mt-1">{tagline}</p>
            ) : insightLoading ? (
              <p className="text-sm text-zinc-400 mt-1 italic">…</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 text-zinc-700">
              <span className="text-amber-500">★</span>
              <span className="font-medium">—</span>
            </span>
            <span className="text-zinc-400">·</span>
            <span className="text-zinc-600">{distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)}km`}</span>
            <span className="rounded-full bg-zinc-900 text-white text-xs font-semibold px-3 py-1">
              {categoryLabel}
            </span>
          </div>

          {place.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {place.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-3 py-1 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {insightLoading && (
            <div className="border-l-4 border-amber-500 pl-3 py-1">
              <p className="text-sm text-zinc-500 italic">{t("place.gathering") ?? "Gathering details…"}</p>
            </div>
          )}

          {!insightLoading && quote && (
            <blockquote className="border-l-4 border-amber-500 pl-3 py-1">
              <p className="text-sm text-zinc-700 leading-relaxed">&ldquo;{quote}&rdquo;</p>
            </blockquote>
          )}

          {!insightLoading && insightError && !quote && (
            <p className="text-xs text-zinc-400">{t("place.insightUnavailable") ?? "Could not load AI description."}</p>
          )}

          {place.description && (
            <p className="text-sm text-zinc-600 leading-relaxed">{place.description}</p>
          )}

          <div className="flex gap-2 items-center">
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-12 rounded-2xl bg-zinc-900 text-white text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Navigation className="w-4 h-4" />
              {t("place.directions") ?? "Get directions"}
            </a>
            <button
              type="button"
              onClick={onSave}
              className="w-12 h-12 rounded-2xl border border-zinc-200 flex items-center justify-center"
              aria-label="Save"
            >
              <Heart
                className="w-5 h-5"
                style={{ fill: place.is_saved ? "var(--accent-gold)" : "none", color: place.is_saved ? "var(--accent-gold)" : "#27272a" }}
              />
            </button>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="w-12 h-12 rounded-2xl border border-zinc-200 flex items-center justify-center"
              aria-label="Share"
            >
              <Share2 className="w-5 h-5 text-zinc-800" />
            </button>
          </div>

          <div>
            <p className="text-[10px] font-semibold tracking-widest text-zinc-400 uppercase mb-2">
              {t("place.location") ?? "Location"}
            </p>
            {staticMapUrl ? (
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="block rounded-2xl overflow-hidden border border-zinc-200">
                <Image src={staticMapUrl} alt="" width={400} height={200} className="w-full h-auto object-cover" unoptimized />
              </a>
            ) : (
              <div className="h-32 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-xs text-zinc-500">
                Map preview unavailable
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 text-sm text-zinc-600">
            <MapPin className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <span>
              {place.address} · {place.arrondissement}
            </span>
          </div>

          {place.opening_hours && (
            <div className="rounded-2xl border border-zinc-200 p-4 bg-zinc-50/80">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-amber-600" />
                <h3 className="font-display font-medium text-zinc-900 text-sm">Horaires</h3>
              </div>
              <div className="space-y-1">
                {DAYS.map((day) => {
                  const hours = (place.opening_hours as Record<string, string>)?.[day];
                  if (!hours) return null;
                  return (
                    <div key={day} className="flex justify-between text-xs">
                      <span className="text-zinc-500">{DAY_LABELS[day]}</span>
                      <span className="text-zinc-800">{hours}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {place.website_url && (
              <a
                href={place.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 h-11 rounded-pill flex items-center justify-center gap-2 text-sm font-sans bg-amber-600 text-white"
              >
                <ExternalLink className="w-4 h-4" /> Website
              </a>
            )}
            {place.instagram_url && (
              <a
                href={place.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-11 px-5 rounded-pill flex items-center justify-center gap-2 text-sm font-sans border border-zinc-200 text-zinc-800"
              >
                <Instagram className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
