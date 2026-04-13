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
import { MapLoadingFallback } from "@/components/map/MapLoadingFallback";
import { useLanguage } from "@/components/LanguageProvider";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { usePlaces } from "@/hooks/usePlaces";
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

const PARIS = { lat: 48.8566, lng: 2.3522 };

export default function MapPage() {
  const { lang } = useLanguage();
  const [liveTrack, setLiveTrack] = useState(false);
  // Dev-only: override GPS with a hardcoded location (Paris by default)
  const [devOverride, setDevOverride] = useState<{ lat: number; lng: number } | null>(null);
  const {
    lat: gpsLat,
    lng: gpsLng,
    coords: gpsCoords,
    loading: locationLoading,
    error: locationError,
    status: locStatus,
    refresh,
  } = useUserLocation({ watch: liveTrack });

  // Effective coords: dev override wins over GPS
  const lat = devOverride?.lat ?? gpsLat;
  const lng = devOverride?.lng ?? gpsLng;
  const coords = useMemo(
    () => (devOverride ? { lat: devOverride.lat, lng: devOverride.lng } : gpsCoords),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devOverride?.lat, devOverride?.lng, gpsCoords],
  );
  const resolvedLat = lat;
  const resolvedLng = lng;
  const debounced = useDebouncedCoords(resolvedLat ?? 0, resolvedLng ?? 0, 750);
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

  // ── Foursquare live places (with 500 m threshold + debounce) ─────────────
  const { places: foursquarePlaces } = usePlaces(lat, lng, 2000);

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
    enabled: resolvedLat !== null && resolvedLng !== null && debounced.lat !== 0 && debounced.lng !== 0,
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
    // 1. Supabase nearby places
    for (const p of nearbyRes?.places ?? []) {
      byId.set(p.id, { ...p, is_saved: savedPlaceIds.has(p.id) });
    }
    // 2. Foursquare live places (fill in where no Supabase entry exists)
    for (const p of foursquarePlaces) {
      if (!byId.has(p.id)) {
        byId.set(p.id, { ...p, is_saved: savedPlaceIds.has(p.id) });
      }
    }
    // 3. AI-highlighted places
    for (const p of highlightedPlaces) {
      const existing = byId.get(p.id);
      byId.set(p.id, {
        ...p,
        is_saved: existing?.is_saved ?? savedPlaceIds.has(p.id),
      });
    }
    // 4. Saved places (always visible)
    for (const p of savedPlaceRows) {
      const existing = byId.get(p.id);
      if (!existing) {
        byId.set(p.id, { ...p, is_saved: true });
      } else {
        byId.set(p.id, { ...existing, is_saved: true });
      }
    }
    return Array.from(byId.values());
  }, [nearbyRes?.places, foursquarePlaces, highlightedPlaces, savedPlaceIds, savedPlaceRows]);

  const mapPlaces = useMemo(() => {
    if (placeFilters.length === 0) return mapPlacesRaw;
    return mapPlacesRaw.filter((p) => placeFilters.includes(p.category as NearbyPlaceFilter));
  }, [mapPlacesRaw, placeFilters]);

  const persistentLabelPlaceIds = useMemo(() => {
    if (lat == null || lng == null) return [] as string[];
    // Show expanded labels for every place currently on the map
    return mapPlaces.map((p) => p.id);
  }, [lat, lng, mapPlaces]);

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

      // Spotlight returned places so their labels pulse
      if (aiPlaces.length > 0) {
        setSpotlightPlaceIds(aiPlaces.map((p) => p.id));
      }

      // Fly map to show all returned places/events
      const allLngs = [
        ...aiEvents.map((e) => e.lng),
        ...aiPlaces.map((p) => p.lng),
      ].filter(Boolean) as number[];
      const allLats = [
        ...aiEvents.map((e) => e.lat),
        ...aiPlaces.map((p) => p.lat),
      ].filter(Boolean) as number[];

      if (mapRef.current && allLngs.length > 0) {
        if (allLngs.length === 1) {
          mapRef.current.flyTo({
            center: [allLngs[0], allLats[0]],
            zoom: 15,
            duration: 1000,
          });
        } else {
          mapRef.current.fitBounds(
            [
              [Math.min(...allLngs) - 0.006, Math.min(...allLats) - 0.004],
              [Math.max(...allLngs) + 0.006, Math.max(...allLats) + 0.004],
            ],
            { padding: 80, duration: 1200 }
          );
        }
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
          setRecommendOpen(false);
          setDetailEvent(ev);
          setSelectedEvent(ev);
          setDetailPlace(null);
        }
      } else {
        const pl = mapPlacesRaw.find((p) => p.id === item.id);
        if (pl) {
          setRecommendOpen(false);
          setDetailPlace(pl);
          setSelectedEvent(null);
          setDetailEvent(null);
        }
      }
    },
    [allEvents, mapPlacesRaw]
  );

  const handleRecenter = useCallback(() => {
    if (lat != null && lng != null) {
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 14, duration: 800 });
    }
  }, [lat, lng]);

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
        <div className="absolute left-2 z-30 pointer-events-auto"
          style={{ top: "calc(max(48px, env(safe-area-inset-top, 0px)) + 180px)" }}>
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

      {/* Dev-only location debug overlay */}
      {process.env.NODE_ENV === "development" && (
        <div className="absolute right-3 z-30 pointer-events-auto"
          style={{ top: "calc(max(48px, env(safe-area-inset-top, 0px)) + 58px)" }}>
          <div className="rounded-xl border border-white/20 bg-black/65 text-white text-[11px] px-2.5 py-2 backdrop-blur-sm min-w-[180px] space-y-1.5">
            {locationLoading && !devOverride && <div className="text-zinc-300">Detecting location…</div>}
            {locationError && !devOverride && <div className="text-amber-300">GPS error — use override below</div>}
            {lat != null && lng != null && (
              <div className="text-zinc-300">
                {devOverride ? "🧪 Override" : "📍 GPS"} {lat.toFixed(4)}, {lng.toFixed(4)}
              </div>
            )}
            {/* Quick-set buttons */}
            <div className="flex gap-1 flex-wrap pt-0.5">
              <button
                type="button"
                onClick={() => {
                  setDevOverride(PARIS);
                  mapRef.current?.flyTo({ center: [PARIS.lng, PARIS.lat], zoom: 14, duration: 900 });
                }}
                className="rounded-md px-2 py-1 bg-blue-500/70 hover:bg-blue-500 transition-colors text-white font-semibold"
              >
                📍 Paris
              </button>
              {devOverride && (
                <button
                  type="button"
                  onClick={() => setDevOverride(null)}
                  className="rounded-md px-2 py-1 bg-white/15 hover:bg-white/25 transition-colors"
                >
                  Use GPS
                </button>
              )}
              {!devOverride && (
                <button
                  type="button"
                  onClick={refresh}
                  className="rounded-md px-2 py-1 bg-white/15 hover:bg-white/25 transition-colors"
                >
                  Retry GPS
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
          initialCenter={lat != null && lng != null ? { lat, lng } : undefined}
          spotlightPlaceIds={spotlightPlaceIds}
          persistentLabelPlaceIds={persistentLabelPlaceIds}
          onSpotlightConsumed={() => setSpotlightPlaceIds([])}
        />
      </div>

      <MapTopChrome cityLabel="Paris" onRecenter={handleRecenter} />

      {/* Chat AI message banner */}
      {aiMessage && !showRecommend && (
        <div className="absolute left-4 right-4 z-20 px-3 py-2 rounded-2xl bg-white/90 border border-zinc-200 text-xs text-zinc-600 shadow-sm"
          style={{ top: "calc(max(48px, env(safe-area-inset-top, 0px)) + 56px)" }}>
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
