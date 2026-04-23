"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DiscoverFeed } from "@/components/discover/DiscoverFeed";
import { EventDetailModal } from "@/components/map/EventDetailModal";
import { PlaceDetailSheet } from "@/components/discover/PlaceDetailSheet";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useSavedEventIds } from "@/hooks/useSavedEvents";
import { useSavedPlaceIds, useSavedPlaceRows } from "@/hooks/useSavedPlaces";
import type { Event, Place } from "@/types";
import type { SearchFilters } from "@/components/discover/SearchOverlay";

function hasSearchFilters(f: SearchFilters): boolean {
  return Boolean(
    f.q.trim() || f.categories.length > 0 || f.arrondissement || f.freeOnly
  );
}

function DiscoverPageContent() {
  const sp = useSearchParams();
  const { coords, lat: rawLat, lng: rawLng } = useUserLocation();
  const queryClient = useQueryClient();
  const { savedIds: savedEventIds, toggleSaved: toggleEventSaved } = useSavedEventIds();
  const { savedIds: savedPlaceIds, toggleSaved: togglePlaceSaved, ready: savedPlaceIdsReady } =
    useSavedPlaceIds();
  const { places: savedPlaceRows, loading: savedPlacesLoading } = useSavedPlaceRows(
    savedPlaceIds,
    savedPlaceIdsReady
  );

  const [filters, setFilters] = useState<SearchFilters>({
    q: "",
    categories: [],
    freeOnly: false,
  });
  const searchMode = hasSearchFilters(filters);

  // Parse URL params to NaN when absent so Number.isFinite() correctly rejects them
  const queryLatStr = sp.get("lat");
  const queryLngStr = sp.get("lng");
  const queryLat = queryLatStr !== null ? Number(queryLatStr) : NaN;
  const queryLng = queryLngStr !== null ? Number(queryLngStr) : NaN;
  const fresh = sp.get("fresh") === "1";

  // Prefer explicit URL coords; fall back to live GPS (never 0/0)
  const hasQueryCoords =
    Number.isFinite(queryLat) && queryLat !== 0 &&
    Number.isFinite(queryLng) && queryLng !== 0;
  const activeLat = hasQueryCoords ? queryLat : (rawLat ?? 0);
  const activeLng = hasQueryCoords ? queryLng : (rawLng ?? 0);

  // Only fire API calls when we have a real non-zero location
  const hasCoords =
    hasQueryCoords ||
    (rawLat !== null && rawLng !== null && rawLat !== 0 && rawLng !== 0);

  const { data: discover, isLoading: discoverLoading } = useQuery({
    queryKey: ["discover", activeLat, activeLng, fresh ? "fresh" : "base"],
    queryFn: async () => {
      const res = await fetch(
        `/api/discover?lat=${encodeURIComponent(String(activeLat))}&lng=${encodeURIComponent(String(activeLng))}`
      );
      if (!res.ok) throw new Error("discover failed");
      return res.json() as Promise<{
        happeningNow: Event[];
        upcoming: Event[];
        thisWeekend: Event[];
        forYou: Event[];
        bestCafes: Place[];
        hiddenGems: Place[];
        nearYou: (Event | Place)[];
      }>;
    },
    staleTime: fresh ? 0 : 30_000,
    refetchOnWindowFocus: true,
    enabled: hasCoords,
  });

  // Personalised feed — replaces discover.forYou when available
  const { data: feedData } = useQuery({
    queryKey: ["feed", activeLat, activeLng, fresh ? "fresh" : "base"],
    queryFn: async () => {
      const params = new URLSearchParams({
        lat: String(activeLat),
        lng: String(activeLng),
        limit: "40",
      });
      const res = await fetch(`/api/events/feed?${params.toString()}`);
      if (!res.ok) throw new Error("feed failed");
      return res.json() as Promise<{
        events: Event[];
        isPersonalised: boolean;
        source: string;
      }>;
    },
    staleTime: fresh ? 0 : 3 * 60 * 1000,
    enabled: hasCoords,
  });

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: [
      "search",
      filters.q,
      filters.categories.join(","),
      filters.arrondissement ?? "",
      filters.freeOnly,
      coords.lat,
      coords.lng,
      activeLat,
      activeLng,
      fresh,
    ],
    enabled: searchMode,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.categories.length)
        params.set("categories", filters.categories.join(","));
      if (filters.arrondissement) params.set("arrondissement", filters.arrondissement);
      if (filters.freeOnly) params.set("free_only", "1");
      params.set("lat", String(activeLat));
      params.set("lng", String(activeLng));
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) throw new Error("search failed");
      return res.json() as Promise<{ events: Event[]; places: Place[] }>;
    },
  });

  const withSavedEvent = useCallback(
    (e: Event): Event => ({ ...e, is_saved: savedEventIds.has(e.id) }),
    [savedEventIds]
  );
  const withSavedPlace = useCallback(
    (p: Place): Place => ({ ...p, is_saved: savedPlaceIds.has(p.id) }),
    [savedPlaceIds]
  );

  const happeningNow = useMemo(
    () => (discover?.happeningNow ?? []).map(withSavedEvent),
    [discover?.happeningNow, withSavedEvent]
  );
  const upcoming = useMemo(
    () => (discover?.upcoming ?? []).map(withSavedEvent),
    [discover?.upcoming, withSavedEvent]
  );
  const thisWeekend = useMemo(
    () => (discover?.thisWeekend ?? []).map(withSavedEvent),
    [discover?.thisWeekend, withSavedEvent]
  );
  // Use personalised feed when available; fall back to discover.forYou
  const forYou = useMemo(() => {
    const raw = feedData?.events?.length ? feedData.events : (discover?.forYou ?? []);
    return raw.map(withSavedEvent);
  }, [feedData?.events, discover?.forYou, withSavedEvent]);
  const bestCafes = useMemo(
    () => (discover?.bestCafes ?? []).map(withSavedPlace),
    [discover?.bestCafes, withSavedPlace]
  );
  const hiddenGems = useMemo(
    () => (discover?.hiddenGems ?? []).map(withSavedPlace),
    [discover?.hiddenGems, withSavedPlace]
  );
  const nearYou = useMemo(() => {
    const raw = discover?.nearYou ?? [];
    return raw.map((item) =>
      "start_time" in item ? withSavedEvent(item as Event) : withSavedPlace(item as Place)
    );
  }, [discover?.nearYou, withSavedEvent, withSavedPlace]);

  const searchEvents = useMemo(
    () => (searchData?.events ?? []).map(withSavedEvent),
    [searchData?.events, withSavedEvent]
  );
  const searchPlaces = useMemo(
    () => (searchData?.places ?? []).map(withSavedPlace),
    [searchData?.places, withSavedPlace]
  );

  const savedPlacesForFeed = useMemo(
    () => savedPlaceRows.map((p) => ({ ...p, is_saved: true as const })),
    [savedPlaceRows]
  );

  const [detailEvent, setDetailEvent] = useState<Event | null>(null);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);

  const handleEventSave = useCallback(
    async (event: Event) => {
      await toggleEventSaved(event.id);
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      void queryClient.invalidateQueries({ queryKey: ["discover"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    [toggleEventSaved, queryClient]
  );

  const handlePlaceSave = useCallback(
    async (place: Place) => {
      await togglePlaceSaved(place.id);
    },
    [togglePlaceSaved]
  );

  return (
    <>
      <DiscoverFeed
        happeningNow={happeningNow}
        upcoming={upcoming}
        thisWeekend={thisWeekend}
        forYou={forYou}
        bestCafes={bestCafes}
        hiddenGems={hiddenGems}
        nearYou={nearYou}
        savedPlaces={savedPlacesForFeed}
        savedPlacesLoading={savedPlacesLoading}
        filters={filters}
        onFiltersApply={setFilters}
        searchMode={searchMode}
        searchEvents={searchEvents}
        searchPlaces={searchPlaces}
        searchLoading={searchLoading}
        discoverLoading={discoverLoading}
        isPersonalisedFeed={feedData?.isPersonalised}
        onEventClick={setDetailEvent}
        onPlaceClick={setDetailPlace}
        onEventSave={handleEventSave}
        onPlaceSave={handlePlaceSave}
      />

      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          userLat={activeLat}
          userLng={activeLng}
          onClose={() => setDetailEvent(null)}
          onSaveToggle={() => void handleEventSave(detailEvent)}
          onAttend={() => {}}
        />
      )}

      {detailPlace && (
        <PlaceDetailSheet
          place={detailPlace}
          userLat={activeLat}
          userLng={activeLng}
          onClose={() => setDetailPlace(null)}
          onSave={() => void handlePlaceSave(detailPlace)}
        />
      )}
    </>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={null}>
      <DiscoverPageContent />
    </Suspense>
  );
}
