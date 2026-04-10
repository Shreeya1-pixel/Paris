"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import type { MapRef } from "react-map-gl/mapbox";
import { MapTopChrome } from "@/components/map/MapTopChrome";
import { MapBottomChrome } from "@/components/map/MapBottomChrome";
import { MapLocationHUD } from "@/components/map/MapLocationHUD";
import type { NearbyPlaceFilter } from "@/components/map/MapPlaceFilterBar";
import { EventDetailModal } from "@/components/map/EventDetailModal";
import { PlaceDetailSheet } from "@/components/discover/PlaceDetailSheet";
import { AiRecommendPanel } from "@/components/map/AiRecommendPanel";
import type { Event, NearbyMapItem, Place } from "@/types";
import { PARIS_CENTER } from "@/lib/constants";
import { MapLoadingFallback } from "@/components/map/MapLoadingFallback";
import { useLanguage } from "@/components/LanguageProvider";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { useSavedEventIds } from "@/hooks/useSavedEvents";
import { useSavedPlaceIds, useSavedPlaceRows } from "@/hooks/useSavedPlaces";
import { useAiRecommend } from "@/hooks/useAiRecommend";
import type { RecommendItem } from "@/lib/ai/recommendTypes";

const MapView = dynamic(
  () => import("@/components/map/MapView").then((m) => ({ default: m.MapView })),
  {
    ssr: false,
    loading: () => <MapLoadingFallback />,
  }
);

const NEARBY_STALE_MS = 3 * 60 * 1000;
const NEARBY_RADIUS_KM = 6;

export default function MapPage() {
  const { lang } = useLanguage();
  const [liveTrack, setLiveTrack] = useState(false);
  const {
    lat,
    lng,
    coords,
    loading: locationLoading,
    error: locationError,
    status: locStatus,
    refresh,
  } = useUserLocation({ watch: liveTrack });
  const resolvedLat = lat ?? (locStatus === "denied" ? PARIS_CENTER.lat : null);
  const resolvedLng = lng ?? (locStatus === "denied" ? PARIS_CENTER.lng : null);
  const debounced = useDebouncedCoords(resolvedLat ?? coords.lat, resolvedLng ?? coords.lng, 750);
  const { savedIds: savedEventIds, toggleSaved: toggleEventSaved } = useSavedEventIds();
  const { savedIds: savedPlaceIds, toggleSaved: togglePlaceSaved, ready: savedPlaceIdsReady } =
    useSavedPlaceIds();
  const { places: savedPlaceRows } = useSavedPlaceRows(savedPlaceIds, savedPlaceIdsReady);

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [detailEvent, setDetailEvent] = useState<Event | null>(null);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  const [highlightedEventIds, setHighlightedEventIds] = useState<Set<string>>(new Set());
  const [highlightedPlaces, setHighlightedPlaces] = useState<Place[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [placeFilters, setPlaceFilters] = useState<NearbyPlaceFilter[]>([]);
  const [spotlightPlaceIds, setSpotlightPlaceIds] = useState<string[]>([]);
  const [flyToUserOnce, setFlyToUserOnce] = useState<{ lat: number; lng: number } | null>(null);

  const mapRef = useRef<MapRef | null>(null);
  const hasFlownToUser = useRef(false);
  const hasSpotlit = useRef(false);

  // ── AI recommendations ────────────────────────────────────────────────────
  const recommend = useAiRecommend();
  const [recommendOpen, setRecommendOpen] = useState(false);

  // ── Unified nearby feed (events + places) ────────────────────────────────
  const { data: nearbyRes } = useQuery({
    queryKey: ["nearby", debounced.lat, debounced.lng, NEARBY_RADIUS_KM],
    queryFn: async () => {
      const params = new URLSearchParams({
        lat: String(debounced.lat),
        lng: String(debounced.lng),
        radius: String(NEARBY_RADIUS_KM),
        limit: "30",
      });
      const res = await fetch(`/api/nearby?${params}`);
      if (!res.ok) throw new Error("nearby feed");
      return res.json() as Promise<{ items: NearbyMapItem[]; events: Event[]; places: Place[] }>;
    },
    staleTime: NEARBY_STALE_MS,
    enabled: resolvedLat !== null && resolvedLng !== null,
  });

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    // eslint-disable-next-line no-console
    console.log("[Map] nearby items:", nearbyRes?.items?.length ?? 0);
  }, [nearbyRes?.items]);

  const allEvents = useMemo(() => {
    return (nearbyRes?.events ?? []).map((e) => ({
      ...e,
      is_saved: savedEventIds.has(e.id),
    }));
  }, [nearbyRes?.events, savedEventIds]);

  const mapPlacesRaw = useMemo(() => {
    const byId = new Map<string, Place>();
    for (const p of nearbyRes?.places ?? []) {
      byId.set(p.id, { ...p, is_saved: savedPlaceIds.has(p.id) });
    }
    for (const p of highlightedPlaces) {
      const existing = byId.get(p.id);
      byId.set(p.id, {
        ...p,
        is_saved: existing?.is_saved ?? savedPlaceIds.has(p.id),
      });
    }
    for (const p of savedPlaceRows) {
      const existing = byId.get(p.id);
      if (!existing) {
        byId.set(p.id, { ...p, is_saved: true });
      } else {
        byId.set(p.id, { ...existing, is_saved: true });
      }
    }
    return Array.from(byId.values());
  }, [nearbyRes?.places, highlightedPlaces, savedPlaceIds, savedPlaceRows]);

  const mapPlaces = useMemo(() => {
    if (placeFilters.length === 0) return mapPlacesRaw;
    return mapPlacesRaw.filter((p) => placeFilters.includes(p.category as NearbyPlaceFilter));
  }, [mapPlacesRaw, placeFilters]);

  useEffect(() => {
    if (locStatus !== "granted" || hasFlownToUser.current || lat == null || lng == null) return;
    hasFlownToUser.current = true;
    setFlyToUserOnce({ lat, lng });
  }, [locStatus, lat, lng]);

  useEffect(() => {
    if (locStatus !== "granted" || hasSpotlit.current || mapPlacesRaw.length === 0) return;
    hasSpotlit.current = true;
    const sorted = [...mapPlacesRaw].sort(
      (a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99)
    );
    setSpotlightPlaceIds(sorted.slice(0, 5).map((p) => p.id));
  }, [locStatus, mapPlacesRaw]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveToggle = useCallback(
    async (event: Event) => {
      await toggleEventSaved(event.id);
      if (detailEvent?.id === event.id) {
        setDetailEvent((e) => (e ? { ...e, is_saved: !e.is_saved } : null));
      }
    },
    [detailEvent?.id, toggleEventSaved]
  );

  const handleChatResult = useCallback(
    (result: { events: unknown[]; places: unknown[]; message: string }) => {
      const aiEvents = (result.events ?? []) as Event[];
      const aiPlaces = (result.places ?? []) as Place[];
      setHighlightedEventIds(new Set(aiEvents.map((e) => e.id)));
      setHighlightedPlaces(aiPlaces);
      setAiMessage(result.message ?? "");

      if (mapRef.current && aiEvents.length > 0) {
        const lngs = aiEvents.map((e) => e.lng);
        const lats = aiEvents.map((e) => e.lat);
        mapRef.current.fitBounds(
          [
            [Math.min(...lngs) - 0.005, Math.min(...lats) - 0.003],
            [Math.max(...lngs) + 0.005, Math.max(...lats) + 0.003],
          ],
          { padding: 80, duration: 1200 }
        );
      }
    },
    []
  );

  const handleSearchSubmit = useCallback(async () => {
    if (!searchQuery.trim() || searchLoading) return;
    setSearchLoading(true);
    setAiMessage("");
    // Close recommend panel when chat is used
    setRecommendOpen(false);
    recommend.clear();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          lat: coords.lat,
          lng: coords.lng,
          lang,
        }),
      });
      const data = await res.json();
      if (data.events !== undefined) {
        handleChatResult(data);
        setSearchQuery("");
      }
    } catch {
      /* ignore */
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, searchLoading, coords, handleChatResult, lang, recommend]);

  // ── Chip click → call /api/ai/recommend directly ─────────────────────────
  const handleChipSelect = useCallback(
    async (vibe: string) => {
      setRecommendOpen(true);
      setAiMessage("");
      setHighlightedEventIds(new Set());
      setHighlightedPlaces([]);
      await recommend.fetch(coords.lat, coords.lng, vibe as never, lang);
    },
    [coords.lat, coords.lng, lang, recommend]
  );

  // ── When user clicks a recommendation card ────────────────────────────────
  const handleRecommendItemClick = useCallback(
    (item: RecommendItem) => {
      // Fly map to the pin
      if (item.lat != null && item.lng != null && mapRef.current) {
        mapRef.current.flyTo({
          center: [item.lng, item.lat],
          zoom: 15,
          duration: 900,
        });
      }

      // Open the corresponding detail panel
      if (item.type === "event") {
        const ev = allEvents.find((e) => e.id === item.id);
        if (ev) {
          setDetailEvent(ev);
          setSelectedEvent(ev);
          setDetailPlace(null);
        }
      } else {
        const pl = mapPlaces.find((p) => p.id === item.id);
        if (pl) {
          setDetailPlace(pl);
          setSelectedEvent(null);
          setDetailEvent(null);
        }
      }
    },
    [allEvents, mapPlaces]
  );

  const handleRecenter = useCallback(() => {
    const targetLat = lat ?? (locStatus === "denied" ? PARIS_CENTER.lat : coords.lat);
    const targetLng = lng ?? (locStatus === "denied" ? PARIS_CENTER.lng : coords.lng);
    mapRef.current?.flyTo({
      center: [targetLng, targetLat],
      zoom: 13,
      duration: 800,
    });
  }, [lat, lng, coords.lat, coords.lng, locStatus]);

  const handleMapEventSelect = useCallback((event: Event | null) => {
    setSelectedEvent(event);
    setDetailEvent(event);
    if (event) {
      setDetailPlace(null);
      setRecommendOpen(false);
    }
  }, []);

  const handleMapPlaceSelect = useCallback((place: Place | null) => {
    setDetailPlace(place);
    if (place) {
      setSelectedEvent(null);
      setDetailEvent(null);
      setRecommendOpen(false);
    }
  }, []);

  const showRecommend = recommendOpen && (recommend.loading || recommend.items.length > 0 || !!recommend.error);

  const showUserMarker = locStatus === "granted" && lat != null && lng != null;

  return (
    <div className="fixed inset-0 bg-zinc-100">
      <MapLocationHUD status={locStatus} lat={coords.lat} lng={coords.lng} tracking={liveTrack} />

      {process.env.NODE_ENV === "development" && (
        <div className="absolute top-[200px] left-2 z-30 pointer-events-auto">
          <label className="flex items-center gap-2 px-2 py-1 rounded-lg bg-black/60 text-[10px] text-white font-sans cursor-pointer">
            <input
              type="checkbox"
              checked={liveTrack}
              onChange={(e) => setLiveTrack(e.target.checked)}
              className="rounded border-zinc-500"
            />
            Track location (5s debounce)
          </label>
        </div>
      )}

      <div className="absolute top-[78px] right-3 z-30 pointer-events-auto">
        <div className="rounded-xl border border-white/20 bg-black/65 text-white text-[11px] px-2.5 py-2 backdrop-blur-sm min-w-[170px]">
          {locationLoading && <div>Detecting location...</div>}
          {locationError && <div className="text-amber-300">Error: {locationError}</div>}
          {lat != null && lng != null && (
            <div>
              Lat: {lat.toFixed(5)} Lng: {lng.toFixed(5)}
            </div>
          )}
          <button
            type="button"
            onClick={refresh}
            className="mt-1.5 rounded-md px-2 py-1 bg-white/15 hover:bg-white/25 transition-colors"
          >
            Retry location
          </button>
        </div>
      </div>

      {/* Map layer */}
      <div className="absolute inset-0 z-0">
        <MapView
          events={allEvents}
          places={mapPlaces}
          highlightedEventIds={highlightedEventIds}
          selectedEventId={selectedEvent?.id ?? null}
          selectedPlaceId={detailPlace?.id ?? null}
          onEventSelect={handleMapEventSelect}
          onPlaceSelect={handleMapPlaceSelect}
          categoryFilter={null}
          onMapRef={(ref) => {
            mapRef.current = ref;
          }}
          userLocation={showUserMarker && lat != null && lng != null ? { lat, lng } : null}
          showUserMarker={showUserMarker}
          flyToUserOnce={flyToUserOnce}
          spotlightPlaceIds={spotlightPlaceIds}
          onSpotlightConsumed={() => setSpotlightPlaceIds([])}
        />
      </div>

      <MapTopChrome cityLabel="Paris" onRecenter={handleRecenter} />

      {/* Chat AI message banner */}
      {aiMessage && !showRecommend && (
        <div className="absolute top-[76px] left-4 right-4 z-20 px-3 py-2 rounded-2xl bg-white/90 border border-zinc-200 text-xs text-zinc-600 shadow-sm">
          {aiMessage}
        </div>
      )}

      {/* AI Recommendations slide-up panel */}
      <AiRecommendPanel
        items={recommend.items}
        message={recommend.message}
        source={recommend.source}
        loading={recommend.loading}
        error={recommend.error}
        onClose={() => {
          setRecommendOpen(false);
          recommend.clear();
        }}
        onItemClick={handleRecommendItemClick}
      />

      <MapBottomChrome
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        searchLoading={searchLoading || recommend.loading}
        onChipSelect={handleChipSelect}
        placeFilters={placeFilters}
        onPlaceFiltersChange={setPlaceFilters}
      />

      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          userLat={coords.lat}
          userLng={coords.lng}
          onClose={() => {
            setDetailEvent(null);
            setSelectedEvent(null);
          }}
          onSaveToggle={() => void handleSaveToggle(detailEvent)}
          onAttend={() => {}}
        />
      )}

      {detailPlace && (
        <PlaceDetailSheet
          place={detailPlace}
          userLat={coords.lat}
          userLng={coords.lng}
          onClose={() => setDetailPlace(null)}
          onSave={async () => {
            await togglePlaceSaved(detailPlace.id);
            setDetailPlace((p) => (p ? { ...p, is_saved: !p.is_saved } : null));
          }}
        />
      )}
    </div>
  );
}
