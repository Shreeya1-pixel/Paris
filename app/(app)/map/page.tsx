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
import type { Event, GeminiMapLandmark, NearbyMapItem, Place } from "@/types";
import { MapLoadingFallback } from "@/components/map/MapLoadingFallback";
import { useLanguage } from "@/components/LanguageProvider";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { usePlaces } from "@/hooks/usePlaces";
import { useSavedEventIds } from "@/hooks/useSavedEvents";
import { useSavedPlaceIds, useSavedPlaceRows } from "@/hooks/useSavedPlaces";
import { useAiRecommend } from "@/hooks/useAiRecommend";

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
    lat: gpsLat,
    lng: gpsLng,
    coords: gpsCoords,
    loading: locationLoading,
    error: locationError,
    status: locStatus,
    refresh,
  } = useUserLocation({ watch: liveTrack });

  const lat = gpsLat;
  const lng = gpsLng;
  const coords = useMemo(() => gpsCoords, [gpsCoords]);
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
  const [assistantSessionId, setAssistantSessionId] = useState("");
  const [assistantRemaining, setAssistantRemaining] = useState<number | null>(null);
  const [manualSearchHint, setManualSearchHint] = useState(false);

  const mapRef = useRef<MapRef | null>(null);
  const hasFlownToUser = useRef(false);
  const hasSpotlit = useRef(false);

  // ── AI recommendations ────────────────────────────────────────────────────
  const recommend = useAiRecommend();
  const [recommendOpen, setRecommendOpen] = useState(false);

  // ── Foursquare live places (with 500 m threshold + debounce) ─────────────
  const { places: foursquarePlaces } = usePlaces(lat, lng, 2000);

  // Top 7 nearest Foursquare places to auto-show as map popups
  const foursquarePopups = useMemo(() => {
    if (!lat || !lng || foursquarePlaces.length === 0) return [];
    return [...foursquarePlaces]
      .sort((a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99))
      .slice(0, 7);
  }, [foursquarePlaces, lat, lng]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id = sessionStorage.getItem("ow_assistant_sid");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("ow_assistant_sid", id);
    }
    setAssistantSessionId(id);
  }, []);

  const { data: landmarkRes } = useQuery({
    queryKey: ["gemini-landmarks", debounced.lat, debounced.lng],
    queryFn: async () => {
      const res = await fetch(
        `/api/map/landmarks?lat=${encodeURIComponent(String(debounced.lat))}&lng=${encodeURIComponent(String(debounced.lng))}`
      );
      if (!res.ok) return { landmarks: [] as GeminiMapLandmark[] };
      return res.json() as Promise<{ landmarks: GeminiMapLandmark[] }>;
    },
    staleTime: 12 * 60 * 1000,
    enabled:
      resolvedLat !== null &&
      resolvedLng !== null &&
      debounced.lat !== 0 &&
      debounced.lng !== 0,
  });

  const geminiLandmarks = landmarkRes?.landmarks ?? [];

  const { data: liveDiscoverRes } = useQuery({
    queryKey: ["discover-live", debounced.lat, debounced.lng],
    queryFn: async () => {
      const res = await fetch(
        `/api/discover/live?lat=${encodeURIComponent(String(debounced.lat))}&lng=${encodeURIComponent(String(debounced.lng))}`
      );
      if (!res.ok) return { events: [] as Event[] };
      return res.json() as Promise<{ events: Event[] }>;
    },
    staleTime: 5 * 60 * 1000,
    enabled:
      resolvedLat !== null &&
      resolvedLng !== null &&
      debounced.lat !== 0 &&
      debounced.lng !== 0,
  });

  const discoverContextEvents = useMemo(() => {
    type CtxEv = {
      id: string;
      title: string;
      start_time: string;
      source: "app" | "ticketmaster" | "live";
      ticket_url: string | null;
    };
    const fromApp: CtxEv[] = (nearbyRes?.events ?? []).slice(0, 22).map((e) => ({
      id: e.id,
      title: e.title,
      start_time: e.start_time,
      source: "app",
      ticket_url: e.ticket_url,
    }));
    const fromLive: CtxEv[] = (liveDiscoverRes?.events ?? []).slice(0, 22).map((e) => ({
      id: e.id,
      title: e.title,
      start_time: e.start_time,
      source: e.id.startsWith("tm-") ? "ticketmaster" : "live",
      ticket_url: e.ticket_url,
    }));
    const seen = new Set<string>();
    const merged: CtxEv[] = [];
    for (const x of [...fromApp, ...fromLive]) {
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      merged.push(x);
    }
    return merged;
  }, [nearbyRes?.events, liveDiscoverRes?.events]);

  const allEvents = useMemo(() => {
    const byId = new Map<string, Event>();
    for (const e of nearbyRes?.events ?? []) {
      byId.set(e.id, { ...e, is_saved: savedEventIds.has(e.id) });
    }
    for (const e of liveDiscoverRes?.events ?? []) {
      if (!byId.has(e.id)) {
        byId.set(e.id, { ...e, is_saved: savedEventIds.has(e.id) });
      }
    }
    return Array.from(byId.values());
  }, [nearbyRes?.events, liveDiscoverRes?.events, savedEventIds]);

  // Top 5 nearest Ticketmaster events for map popups
  const ticketmasterMapEvents = useMemo(() => {
    return [...(liveDiscoverRes?.events ?? [])]
      .filter((e) => e.id.startsWith("tm-") && e.lat && e.lng)
      .sort((a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99))
      .slice(0, 5);
  }, [liveDiscoverRes?.events]);

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

  const submitMapChat = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (!q || searchLoading || !assistantSessionId) return;
      const hasCoords = Number.isFinite(coords.lat) && Number.isFinite(coords.lng) && coords.lat !== 0 && coords.lng !== 0;
      if (!hasCoords) {
        setAiMessage("Enable location to get nearby suggestions.");
        setManualSearchHint(true);
        return;
      }
      setSearchLoading(true);
      setAiMessage("");
      setManualSearchHint(false);
      setRecommendOpen(false);
      recommend.clear();
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            lat: coords.lat,
            lng: coords.lng,
            lang,
            mode: "assistant",
            sessionId: assistantSessionId,
            discoverContext: { events: discoverContextEvents },
          }),
        });
        const data = (await res.json()) as {
          events?: unknown[];
          places?: unknown[];
          message?: string;
          manualSearch?: boolean;
          remainingAssistant?: number;
        };
        if (data.events !== undefined) {
          handleChatResult(data as Parameters<typeof handleChatResult>[0]);
          setSearchQuery("");
          if (typeof data.remainingAssistant === "number") {
            setAssistantRemaining(data.remainingAssistant);
          }
          if (data.manualSearch) setManualSearchHint(true);
        }
      } catch {
        setManualSearchHint(true);
      } finally {
        setSearchLoading(false);
      }
    },
    [
      searchLoading,
      assistantSessionId,
      coords.lat,
      coords.lng,
      lang,
      discoverContextEvents,
      handleChatResult,
      recommend,
    ]
  );

  const handleSearchSubmit = useCallback(() => {
    void submitMapChat(searchQuery);
  }, [searchQuery, submitMapChat]);

  useEffect(() => {
    if (locStatus === "denied" || locationError) setManualSearchHint(true);
  }, [locStatus, locationError]);

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
          return;
        }
        if (item.lat != null && item.lng != null) {
          setRecommendOpen(false);
          setDetailEvent({
            id: item.id,
            created_by: "system",
            title: item.title,
            description: item.description,
            category: "culture",
            vibe_tags: [],
            start_time: item.start_time ?? new Date().toISOString(),
            end_time: null,
            location_name: item.arrondissement ?? null,
            arrondissement: item.arrondissement ?? null,
            address: null,
            lat: item.lat,
            lng: item.lng,
            image_url: item.image_url ?? null,
            ticket_url: null,
            is_free: item.is_free ?? false,
            price: null,
            max_attendees: null,
            attendee_count: 0,
            source: "curated",
            status: "active",
            created_at: new Date().toISOString(),
            is_saved: false,
          });
          setSelectedEvent(null);
          setDetailPlace(null);
        }
      } else {
        const pl = mapPlacesRaw.find((p) => p.id === item.id);
        if (pl) {
          setRecommendOpen(false);
          setDetailPlace(pl);
          setSelectedEvent(null);
          setDetailEvent(null);
          return;
        }
        if (item.lat != null && item.lng != null) {
          setRecommendOpen(false);
          setDetailPlace({
            id: item.id,
            name: item.title,
            category: "cafe",
            description: item.description,
            address: item.arrondissement ?? "Nearby location",
            arrondissement: item.arrondissement ?? "Nearby",
            lat: item.lat,
            lng: item.lng,
            image_url: item.image_url ?? null,
            tags: [],
            opening_hours: null,
            price_range: null,
            website_url: null,
            instagram_url: null,
            is_featured: false,
            created_at: new Date().toISOString(),
            is_saved: false,
          });
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
          geminiLandmarks={geminiLandmarks}
          foursquarePopups={foursquarePopups}
          ticketmasterEvents={ticketmasterMapEvents}
        />
      </div>

      <MapTopChrome
        cityLabel={
          resolvedLat != null && resolvedLng != null
            ? `${resolvedLat.toFixed(2)}°, ${resolvedLng.toFixed(2)}°`
            : undefined
        }
        onRecenter={handleRecenter}
      />

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
        placeFilters={placeFilters}
        onPlaceFiltersChange={setPlaceFilters}
        onAssistantChip={(q) => void submitMapChat(q)}
        remainingAssistant={assistantRemaining}
        showManualSearchHint={manualSearchHint}
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
