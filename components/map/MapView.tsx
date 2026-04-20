"use client";

import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import MapGL, { Marker, Popup, type MapRef } from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Event, GeminiMapLandmark, NearbyMapItem, Place, ParisCategory } from "@/types";
import { EventPin } from "./EventPin";
import { PlaceMapLabel } from "./PlaceMapLabel";
import { clusterPlaces, clusterCellForZoom, CLUSTER_ZOOM_THRESHOLD } from "@/utils/mapHelpers";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";

/** Zoom when centered on the user after GPS — street / few-block context */
const USER_LOCATION_ZOOM = 15;

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
  /** Initial map center when no user location yet */
  initialCenter?: { lat: number; lng: number };
  /** After location: pulse these place ids (nearest picks) */
  spotlightPlaceIds?: string[];
  /** Keep labels expanded for nearby places after location is detected */
  persistentLabelPlaceIds?: string[];
  onSpotlightConsumed?: () => void;
  /** AI-suggested landmarks/shops (custom markers + popups) */
  geminiLandmarks?: GeminiMapLandmark[];
  /** Top nearby Foursquare places shown as auto-open popups */
  foursquarePopups?: Place[];
}

/** Emoji for a place category cluster bubble */
const CLUSTER_EMOJI: Record<string, string> = {
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

const LANDMARK_EMOJI: Record<string, string> = {
  landmark: "📍",
  monument: "🏛️",
  museum: "🖼️",
  market: "🛍️",
  shop: "🛒",
  restaurant: "🍽️",
  cafe: "☕",
  temple: "🛕",
  park: "🌳",
};

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
  initialCenter,
  spotlightPlaceIds = [],
  persistentLabelPlaceIds = [],
  onSpotlightConsumed,
  geminiLandmarks = [],
  foursquarePopups = [],
}: MapViewProps) {
  const mapRef = useRef<MapRef | null>(null);
  const hasFlownRef = useRef(false);
  const lastMarkerClickMs = useRef(0);
  const ignoreNextMapClick = useRef(false);
  const rafRef = useRef<number | null>(null);
  const poiNoiseFilteredRef = useRef(false);

  const [spotlightOpen, setSpotlightOpen] = useState<string[]>([]);
  const [mapZoom, setMapZoom] = useState(initialCenter ? USER_LOCATION_ZOOM : 2);
  /** True after MapGL `onLoad` — ensures post-GPS fly runs even if `flyToUserOnce` fired first */
  const [mapReady, setMapReady] = useState(false);
  const [landmarkPopupIds, setLandmarkPopupIds] = useState<string[]>([]);

  const [fsqPopupIds, setFsqPopupIds] = useState<string[]>([]);

  // ── Zoom tracking via requestAnimationFrame ───────────────────────────────
  const handleMove = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const zoom = mapRef.current?.getZoom() ?? mapZoom;
      setMapZoom(zoom);
      rafRef.current = null;
    });
  }, [mapZoom]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map && !poiNoiseFilteredRef.current) {
      const hiddenClasses = [
        "hospital",
        "medical",
        "lodging",
        "hotel",
        "motel",
        "hostel",
        "guest_house",
      ];
      const hiddenSubclasses = [
        "hospital",
        "clinic",
        "doctor",
        "dentist",
        "physiotherapist",
        "veterinary",
      ];
      const layers = map.getStyle()?.layers ?? [];
      for (const layer of layers) {
        if (layer.type !== "symbol") continue;
        if (layer.source !== "composite") continue;
        const sourceLayer = (layer as { "source-layer"?: string })["source-layer"];
        if (sourceLayer !== "poi_label") continue;
        const existingFilter = (layer as { filter?: unknown }).filter;
        const nextFilter = [
          "all",
          existingFilter ?? ["==", 1, 1],
          [
            "!",
            [
              "any",
              [
                "in",
                ["downcase", ["coalesce", ["get", "class"], ""]],
                ["literal", hiddenClasses],
              ],
              [
                "in",
                ["downcase", ["coalesce", ["get", "subclass"], ""]],
                ["literal", hiddenSubclasses],
              ],
            ],
          ],
        ];
        map.setFilter(layer.id, nextFilter as mapboxgl.FilterSpecification);
      }
      poiNoiseFilteredRef.current = true;
    }
    if (mapRef.current && onMapRef) {
      onMapRef(mapRef.current);
    }
    const zoom = mapRef.current?.getZoom() ?? mapZoom;
    setMapZoom(zoom);
    setMapReady(true);
  }, [onMapRef, mapZoom]);

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
    if (!flyToUserOnce || hasFlownRef.current) return;
    if (!mapReady || !mapRef.current) return;
    hasFlownRef.current = true;
    mapRef.current.flyTo({
      center: [flyToUserOnce.lng, flyToUserOnce.lat],
      zoom: USER_LOCATION_ZOOM,
      essential: true,
      duration: 1200,
    });
  }, [flyToUserOnce, mapReady]);

  useEffect(() => {
    if (geminiLandmarks.length === 0) setLandmarkPopupIds([]);
  }, [geminiLandmarks.length]);
  useEffect(() => {
    if (foursquarePopups.length === 0) setFsqPopupIds([]);
  }, [foursquarePopups.length]);

  useEffect(() => {
    if (!spotlightPlaceIds.length) {
      setSpotlightOpen([]);
      return;
    }
    setSpotlightOpen(spotlightPlaceIds.slice(0, 20));
    const t = window.setTimeout(() => {
      setSpotlightOpen([]);
      onSpotlightConsumed?.();
    }, 12000);
    return () => window.clearTimeout(t);
  }, [spotlightPlaceIds, onSpotlightConsumed]);

  const filteredEvents = categoryFilter
    ? events.filter((e) => e.category === categoryFilter)
    : events;

  // ── Event cluster bubbles ─────────────────────────────────────────────────
  const eventNearbyItems = useMemo((): NearbyMapItem[] => {
    return filteredEvents.map((e) => ({
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
  }, [filteredEvents]);

  const eventClusters = useMemo(() => {
    const CELL = 0.006;
    const bucket = new Map<string, { items: NearbyMapItem[]; lat: number; lng: number }>();
    for (const item of eventNearbyItems) {
      const kLat = Math.round(item.lat / CELL);
      const kLng = Math.round(item.lng / CELL);
      const key = `${kLat}:${kLng}`;
      const existing = bucket.get(key);
      if (!existing) {
        bucket.set(key, { items: [item], lat: item.lat, lng: item.lng });
      } else {
        const n = existing.items.length + 1;
        existing.items.push(item);
        existing.lat = (existing.lat * (n - 1) + item.lat) / n;
        existing.lng = (existing.lng * (n - 1) + item.lng) / n;
      }
    }
    return Array.from(bucket.values()).map((g) => ({
      lat: g.lat,
      lng: g.lng,
      count: g.items.length,
      top: [...g.items].sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9))[0],
    }));
  }, [eventNearbyItems]);

  // ── Place clustering (zoom-aware) ─────────────────────────────────────────
  const { clusters: placeClusters, singletons: singletonPlaces } = useMemo(() => {
    if (mapZoom > CLUSTER_ZOOM_THRESHOLD) {
      return { clusters: [], singletons: places };
    }
    const cellDeg = clusterCellForZoom(mapZoom);
    return clusterPlaces(places, cellDeg);
  }, [places, mapZoom]);

  const bubbleEventLabel = useCallback((item: NearbyMapItem) => {
    const cat = String(item.category).toLowerCase();
    if (cat.includes("cafe")) return "☕ Brunch";
    if (cat.includes("restaurant") || cat.includes("food")) return "🍽️ Food";
    if (cat.includes("bar")) return "🍷 Apero";
    if (cat.includes("nightlife") || cat.includes("club")) return "🎶 Night";
    if (cat.includes("market")) return "🛍️ Market";
    return item.type === "event" ? "✨ Live" : "📍 Spot";
  }, []);

  const ringPlaceId = selectedPlaceId;

  const handleMapClick = useCallback(() => {
    if (ignoreNextMapClick.current) {
      ignoreNextMapClick.current = false;
      return;
    }
    if (Date.now() - lastMarkerClickMs.current < 150) return;
    onEventSelect(null);
    onPlaceSelect?.(null);
    setLandmarkPopupIds([]);
    setFsqPopupIds([]);
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
        longitude: initialCenter?.lng ?? 0,
        latitude: initialCenter?.lat ?? 20,
        zoom: initialCenter ? USER_LOCATION_ZOOM : 2,
      }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={MAP_STYLE}
      minZoom={2}
      maxZoom={18}
      onLoad={handleLoad}
      onMove={handleMove}
      onMoveEnd={handleMoveEnd}
      onClick={handleMapClick}
      attributionControl={false}
    >
      {/* User location marker */}
      {geminiLandmarks.map((L) => (
        <Marker key={L.id} longitude={L.lng} latitude={L.lat} anchor="bottom">
          <div
            className="cursor-pointer select-none flex flex-col items-center"
            onClick={(e) => {
              e.stopPropagation();
              ignoreNextMapClick.current = true;
              lastMarkerClickMs.current = Date.now();
              onEventSelect(null);
              onPlaceSelect?.(null);
              setLandmarkPopupIds((prev) =>
                prev[0] === L.id ? [] : [L.id]
              );
              setFsqPopupIds([]);
            }}
          >
            <div
              className="h-11 min-w-11 px-2.5 rounded-full border border-black/10 bg-white/95 shadow-lg flex items-center justify-center"
              style={{
                backdropFilter: "blur(6px)",
              }}
            >
              <span className="text-[22px] leading-none">
                {LANDMARK_EMOJI[String(L.category).toLowerCase()] ?? "✨"}
              </span>
            </div>
            <div className="w-2.5 h-2.5 -mt-1 rounded-full bg-amber-500/90 border border-white shadow-sm" />
          </div>
        </Marker>
      ))}

      {geminiLandmarks
        .filter((L) => landmarkPopupIds.includes(L.id))
        .map((L) => (
          <Popup
            key={`popup-${L.id}`}
            longitude={L.lng}
            latitude={L.lat}
            anchor="top"
            closeButton={false}
            closeOnClick={false}
            offset={16}
            className="z-20"
            onClose={() => setLandmarkPopupIds((prev) => prev.filter((id) => id !== L.id))}
          >
            <div className="w-[260px] max-w-[80vw]">
              <p className="text-sm font-semibold text-zinc-900">{L.name}</p>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500 mt-0.5">{L.category}</p>
              {L.description ? (
                <p className="text-xs text-zinc-700 mt-1.5 leading-snug">{L.description}</p>
              ) : null}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${L.lat},${L.lng}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 inline-flex items-center rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-zinc-700 transition-colors"
              >
                Get directions
              </a>
            </div>
          </Popup>
        ))}

      {/* Foursquare nearby place popups */}
      {foursquarePopups
        .filter((p) => fsqPopupIds.includes(p.id))
        .map((p) => {
          const distLabel =
            p.distance_km != null
              ? p.distance_km < 1
                ? `${Math.round(p.distance_km * 1000)} m away`
                : `${p.distance_km.toFixed(1)} km away`
              : null;
          return (
            <Popup
              key={`fsq-popup-${p.id}`}
              longitude={p.lng}
              latitude={p.lat}
              anchor="top"
              closeButton={false}
              closeOnClick={false}
              offset={14}
              className="z-20"
              onClose={() => setFsqPopupIds((prev) => prev.filter((id) => id !== p.id))}
            >
              <div className="w-[240px] max-w-[78vw]">
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 leading-tight">{p.name}</p>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-400 mt-0.5">{p.category}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFsqPopupIds((prev) => prev.filter((id) => id !== p.id))}
                    className="ml-auto shrink-0 text-zinc-400 hover:text-zinc-700 leading-none -mt-0.5 -mr-0.5"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                {distLabel && (
                  <p className="text-[11px] text-zinc-500 mt-1.5 flex items-center gap-1">
                    {distLabel}
                    {p.arrondissement ? ` · ${p.arrondissement}` : ""}
                  </p>
                )}
                {p.address && !p.arrondissement && (
                  <p className="text-[11px] text-zinc-500 mt-1 truncate">{p.address}</p>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.lat},${p.lng}`)}&destination_place_id=${encodeURIComponent(p.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex items-center rounded-full bg-zinc-900 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-zinc-700 transition-colors"
                >
                  Get directions
                </a>
              </div>
            </Popup>
          );
        })}

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

      {/* Individual event pins */}
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

      {/* Singleton place labels (not clustered) */}
      {singletonPlaces.map((place) => {
        const selected = ringPlaceId === place.id;
        const pulsing = spotlightOpen.includes(place.id);
        const expanded =
          pulsing ||
          selected ||
          persistentLabelPlaceIds.includes(place.id);
        return (
          <Marker
            key={place.id}
            longitude={place.lng}
            latitude={place.lat}
            anchor="left"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              ignoreNextMapClick.current = true;
              lastMarkerClickMs.current = Date.now();
              onEventSelect(null);
              onPlaceSelect?.(place);
              setFsqPopupIds((prev) =>
                prev[0] === place.id ? [] : [place.id]
              );
              setLandmarkPopupIds([]);
            }}
          >
            <PlaceMapLabel
              place={place}
              expanded={expanded}
              selected={selected}
              pulsing={pulsing}
            />
          </Marker>
        );
      })}

      {/* Place cluster bubbles (when zoomed out) */}
      {placeClusters.map((cluster) => {
        const emoji = CLUSTER_EMOJI[cluster.topCategory] ?? "📍";
        return (
          <Marker
            key={`cluster-${cluster.topPlaceId}`}
            longitude={cluster.lng}
            latitude={cluster.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              ignoreNextMapClick.current = true;
              lastMarkerClickMs.current = Date.now();
              // Fly in to reveal individual places
              mapRef.current?.flyTo({
                center: [cluster.lng, cluster.lat],
                zoom: Math.min(mapZoom + 2, 14),
                duration: 600,
              });
            }}
          >
            <div
              className="cursor-pointer flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/95 shadow-lg border border-black/10 hover:scale-110 transition-transform"
              style={{ backdropFilter: "blur(8px)" }}
            >
              <span className="text-base leading-none">{emoji}</span>
              <span
                className="text-[11px] font-bold text-zinc-800 leading-none"
                style={{ fontFamily: "var(--font-sf-pro)" }}
              >
                {cluster.count}
              </span>
            </div>
          </Marker>
        );
      })}

      {/* Event cluster activity bubbles */}
      {eventClusters.map((cluster) => {
        const label = bubbleEventLabel(cluster.top);
        return (
          <Marker
            key={`evbubble-${cluster.top.id}-${cluster.count}`}
            longitude={cluster.lng}
            latitude={cluster.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              ignoreNextMapClick.current = true;
              lastMarkerClickMs.current = Date.now();
              const event = filteredEvents.find((ev) => ev.id === cluster.top.id);
              if (event) onEventSelect(event);
            }}
          >
            <div className="pointer-events-auto -translate-y-3 rounded-full bg-black/92 text-white text-[10px] font-semibold px-2.5 py-1 shadow-lg border border-white/20 whitespace-nowrap cursor-pointer hover:scale-[1.03] transition-transform">
              {label}
            </div>
          </Marker>
        );
      })}
    </MapGL>
  );
}
