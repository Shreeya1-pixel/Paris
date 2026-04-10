"use client";

import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import MapGL, { Marker, Popup, type MapRef } from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Event, NearbyMapItem, Place, ParisCategory } from "@/types";
import { EventPin } from "./EventPin";
import { PARIS_CENTER } from "@/lib/constants";
import { PlaceMapPopup } from "./PlaceMapPopup";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";

/** Wider than inner Paris so suburbs + edge cases work; still focused on the region */
const PARIS_REGION_BOUNDS: [[number, number], [number, number]] = [
  [1.92, 48.62],
  [2.62, 49.08],
];

interface MapViewProps {
  events: Event[];
  places?: Place[];
  highlightedEventIds?: Set<string>;
  selectedEventId: string | null;
  selectedPlaceId?: string | null;
  onEventSelect: (event: Event | null) => void;
  onPlaceSelect?: (place: Place | null) => void;
  categoryFilter: ParisCategory | null;
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  onMapRef?: (ref: MapRef) => void;
  /** GPS position when permission granted */
  userLocation?: { lat: number; lng: number } | null;
  /** Show "You are here" marker (only when userLocation is the real fix) */
  showUserMarker?: boolean;
  /** After first fix, fly map here once */
  flyToUserOnce?: { lat: number; lng: number } | null;
  /** Briefly open popups + pulse these place ids (nearest picks) */
  spotlightPlaceIds?: string[];
  onSpotlightConsumed?: () => void;
}

export function MapView({
  events,
  places = [],
  highlightedEventIds,
  selectedEventId,
  selectedPlaceId = null,
  onEventSelect,
  onPlaceSelect,
  categoryFilter,
  onBoundsChange,
  onMapRef,
  userLocation = null,
  showUserMarker = false,
  flyToUserOnce = null,
  spotlightPlaceIds = [],
  onSpotlightConsumed,
}: MapViewProps) {
  const mapRef = useRef<MapRef | null>(null);
  const hasFlownRef = useRef(false);
  const lastMarkerClickMs = useRef(0);
  const ignoreNextMapClick = useRef(false);
  const [popupPlaceId, setPopupPlaceId] = useState<string | null>(null);
  const [spotlightOpen, setSpotlightOpen] = useState<string[]>([]);

  const handleLoad = useCallback(() => {
    if (mapRef.current && onMapRef) {
      onMapRef(mapRef.current);
    }
  }, [onMapRef]);

  const handleMoveEnd = useCallback(() => {
    if (!mapRef.current || !onBoundsChange) return;
    const bounds = mapRef.current.getBounds();
    if (!bounds) return;
    onBoundsChange({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    });
  }, [onBoundsChange]);

  useEffect(() => {
    if (!flyToUserOnce || hasFlownRef.current || !mapRef.current) return;
    hasFlownRef.current = true;
    mapRef.current.flyTo({
      center: [flyToUserOnce.lng, flyToUserOnce.lat],
      zoom: 13.5,
      essential: true,
      duration: 1200,
    });
  }, [flyToUserOnce]);

  useEffect(() => {
    if (!spotlightPlaceIds.length) {
      setSpotlightOpen([]);
      return;
    }
    // Pulse the nearest markers (no auto-popup — user clicks to open popup permanently)
    setSpotlightOpen(spotlightPlaceIds.slice(0, 5));
    const t = window.setTimeout(() => {
      setSpotlightOpen([]);
      onSpotlightConsumed?.();
    }, 4000);
    return () => window.clearTimeout(t);
  }, [spotlightPlaceIds, onSpotlightConsumed]);

  const filteredEvents = categoryFilter
    ? events.filter((e) => e.category === categoryFilter)
    : events;

  /** Bubbles match pins: cluster everything actually drawn (not only API `items` slice). */
  const itemsForClusters = useMemo((): NearbyMapItem[] => {
    const ev: NearbyMapItem[] = filteredEvents.map((e) => ({
      id: e.id,
      type: "event",
      name: e.title,
      category: e.category,
      lat: e.lat,
      lng: e.lng,
      distance_km: e.distance_km ?? 0,
      start_time: e.start_time,
      location_name: e.location_name,
      arrondissement: e.arrondissement,
    }));
    const pl: NearbyMapItem[] = places.map((p) => ({
      id: p.id,
      type: "place",
      name: p.name,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      distance_km: p.distance_km ?? 0,
      location_name: p.address,
      arrondissement: p.arrondissement,
    }));
    return [...ev, ...pl];
  }, [filteredEvents, places]);

  const activityClusters = useMemo(() => {
    const CELL = 0.006;
    const bucket = new Map<
      string,
      { items: NearbyMapItem[]; lat: number; lng: number }
    >();

    for (const item of itemsForClusters) {
      const kLat = Math.round(item.lat / CELL);
      const kLng = Math.round(item.lng / CELL);
      const key = `${kLat}:${kLng}`;
      const existing = bucket.get(key);
      if (!existing) {
        bucket.set(key, { items: [item], lat: item.lat, lng: item.lng });
      } else {
        const nextCount = existing.items.length + 1;
        existing.items.push(item);
        existing.lat = (existing.lat * (nextCount - 1) + item.lat) / nextCount;
        existing.lng = (existing.lng * (nextCount - 1) + item.lng) / nextCount;
      }
    }

    return Array.from(bucket.values()).map((group) => {
      const sorted = [...group.items].sort(
        (a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9)
      );
      const top = sorted[0];
      return {
        lat: group.lat,
        lng: group.lng,
        count: group.items.length,
        top,
      };
    });
  }, [itemsForClusters]);

  const bubbleLabel = useCallback((item: NearbyMapItem) => {
    const cat = String(item.category).toLowerCase();
    if (cat.includes("cafe")) return "Brunch";
    if (cat.includes("restaurant") || cat.includes("food")) return "Food";
    if (cat.includes("bar")) return "Apero";
    if (cat.includes("nightlife") || cat.includes("club")) return "Night";
    if (cat.includes("pop-up")) return "Pop-up";
    if (cat.includes("market")) return "Market";
    return item.type === "event" ? "Live" : "Spot";
  }, []);

  const bubbleEmoji = useCallback((item: NearbyMapItem) => {
    const cat = String(item.category).toLowerCase();
    if (cat.includes("cafe")) return "☕";
    if (cat.includes("restaurant") || cat.includes("food")) return "🍽️";
    if (cat.includes("bar")) return "🍷";
    if (cat.includes("nightlife") || cat.includes("club")) return "🎶";
    if (cat.includes("market")) return "🛍️";
    if (item.type === "event") return "✨";
    return "📍";
  }, []);

  // Popup only shows when explicitly clicked — spotlight just pulses the marker dot
  const showPopupFor = (id: string) => popupPlaceId === id;

  const ringPlaceId = selectedPlaceId || popupPlaceId;

  const handleMapClick = useCallback(() => {
    // Marker/bubble clicks can still trigger Map.onClick in react-map-gl.
    // Explicitly swallow the next map click after marker interactions.
    if (ignoreNextMapClick.current) {
      ignoreNextMapClick.current = false;
      return;
    }
    // Guard: if a marker was clicked within the last 150 ms, skip — the Marker's
    // onClick and the Map's onClick both fire and would immediately cancel each other.
    if (Date.now() - lastMarkerClickMs.current < 150) return;
    setPopupPlaceId(null);
    onEventSelect(null);
    onPlaceSelect?.(null);
  }, [onEventSelect, onPlaceSelect]);

  if (!MAPBOX_TOKEN.trim()) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-200 px-6 text-center">
        <p className="text-sm font-medium text-zinc-800 mb-1">Mapbox token missing</p>
        <p className="text-xs text-zinc-600 max-w-sm">
          Add <code className="bg-white/80 px-1 rounded">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to{" "}
          <code className="bg-white/80 px-1 rounded">.env.local</code> and restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <MapGL
      ref={mapRef}
      mapLib={mapboxgl}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{
        longitude: PARIS_CENTER.lng,
        latitude: PARIS_CENTER.lat,
        zoom: 13,
      }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={MAP_STYLE}
      minZoom={11}
      maxZoom={18}
      maxBounds={PARIS_REGION_BOUNDS}
      onLoad={handleLoad}
      onMoveEnd={handleMoveEnd}
      onClick={handleMapClick}
      attributionControl={false}
    >
      {showUserMarker && userLocation && (
        <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="bottom">
          <div className="flex flex-col items-center pointer-events-none select-none">
            <div className="px-2 py-0.5 rounded-full bg-emerald-500 text-[9px] font-sans font-bold text-white shadow-lg mb-0.5 whitespace-nowrap border border-white/90">
              You are here
            </div>
            <div
              className="w-4 h-4 rounded-full border-[3px] border-white shadow-lg"
              style={{
                background: "#10b981",
                boxShadow: "0 0 0 4px rgba(16,185,129,0.35)",
              }}
            />
          </div>
        </Marker>
      )}

      {filteredEvents.map((event) => {
        const isHighlighted = highlightedEventIds?.has(event.id) ?? false;
        const isSelected = selectedEventId === event.id;
        return (
          <Marker
            key={event.id}
            longitude={event.lng}
            latitude={event.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              ignoreNextMapClick.current = true;
              lastMarkerClickMs.current = Date.now();
              setPopupPlaceId(null);
              onEventSelect(isSelected ? null : event);
            }}
          >
            <div
              className="relative cursor-pointer"
              style={{
                filter: isHighlighted
                  ? "drop-shadow(0 0 8px #C9A84C) drop-shadow(0 0 16px #C9A84C88)"
                  : undefined,
                transform: isHighlighted || isSelected ? "scale(1.15)" : undefined,
                transition: "transform 0.2s, filter 0.2s",
              }}
            >
              <EventPin event={event} isSelected={isSelected} onClick={() => {}} />
            </div>
          </Marker>
        );
      })}

      {places.map((place) => {
        const selected = ringPlaceId === place.id;
        const pulsing = spotlightOpen.includes(place.id);
        return (
          <Marker
            key={place.id}
            longitude={place.lng}
            latitude={place.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              ignoreNextMapClick.current = true;
              lastMarkerClickMs.current = Date.now();
              onEventSelect(null);
              setPopupPlaceId((id) => (id === place.id ? null : place.id));
            }}
          >
            <div
              className={`rounded-full border-2 border-white/90 cursor-pointer transition-transform ${
                pulsing ? "animate-pulse" : ""
              }`}
              style={{
                width: selected ? 16 : 12,
                height: selected ? 16 : 12,
                background: "var(--accent-gold)",
                transform: selected || pulsing ? "scale(1.25)" : undefined,
                boxShadow: pulsing ? "0 0 0 6px rgba(201,168,76,0.35)" : undefined,
              }}
              title={place.name}
            />
          </Marker>
        );
      })}

      {activityClusters.map((cluster) => {
        const plus = cluster.count > 1 ? ` +${cluster.count}` : "";
        const label = `${bubbleEmoji(cluster.top)} ${bubbleLabel(cluster.top)}${plus}`;
        return (
          <Marker
            key={`bubble-${cluster.top.type}-${cluster.top.id}-${cluster.count}`}
            longitude={cluster.lng}
            latitude={cluster.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              ignoreNextMapClick.current = true;
              lastMarkerClickMs.current = Date.now();
              if (cluster.top.type === "place") {
                const place = places.find((p) => p.id === cluster.top.id);
                if (place) {
                  setPopupPlaceId(place.id);
                }
                // Keep the bubble interaction lightweight: open popup first,
                // user can tap "Details" inside popup to open the full sheet.
                onPlaceSelect?.(null);
                onEventSelect(null);
              } else {
                const event = filteredEvents.find((ev) => ev.id === cluster.top.id);
                if (event) onEventSelect(event);
                setPopupPlaceId(null);
              }
            }}
          >
            <div className="pointer-events-auto -translate-y-3 rounded-full bg-black/92 text-white text-[10px] font-semibold px-2.5 py-1 shadow-lg border border-white/20 whitespace-nowrap cursor-pointer hover:scale-[1.03] transition-transform">
              {label}
            </div>
          </Marker>
        );
      })}

      {places
        .filter((p) => showPopupFor(p.id))
        .map((place) => (
          <Popup
            key={`pop-${place.id}`}
            longitude={place.lng}
            latitude={place.lat}
            anchor="bottom"
            offset={18}
            onClose={() => {
              setPopupPlaceId((id) => (id === place.id ? null : id));
            }}
            closeButton
            closeOnClick={false}
            className="map-place-popup-root"
          >
            <PlaceMapPopup
              place={place}
              onOpenDetail={() => {
                setPopupPlaceId(null);
                onPlaceSelect?.(place);
              }}
            />
          </Popup>
        ))}
    </MapGL>
  );
}
