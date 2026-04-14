"use client";

/**
 * usePlaces — fetches nearby places from /api/places/foursquare + /api/places/geoapify with:
 *  - 500 ms debounce on lat/lng changes
 *  - 500 m movement threshold: skip re-fetch if user hasn't moved enough
 *  - React Query for client-side caching & deduplication
 *  - Graceful fallback to nearby DB / Gemini landmarks when third-party APIs are empty
 */

import { useRef, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Place, PlaceCategory } from "@/types";
import { haversineKm } from "@/lib/geo";

const DEBOUNCE_MS = 500;
const MOVEMENT_THRESHOLD_KM = 0.5;
const RADIUS_M = 2000;
const STALE_MS = 12 * 60 * 1000; // matches server-side TTL

export interface UsePlacesResult {
  places: Place[];
  loading: boolean;
  error: string | null;
  /** Primary source used for places */
  source: "foursquare" | "geoapify" | "nearby" | "gemini_landmarks" | "none";
}

export function usePlaces(
  lat: number | null,
  lng: number | null,
  radiusM: number = RADIUS_M
): UsePlacesResult {
  // Debounced coords
  const [debounced, setDebounced] = useState<{ lat: number; lng: number } | null>(
    lat != null && lng != null ? { lat, lng } : null
  );
  useEffect(() => {
    if (lat == null || lng == null) return;
    const t = setTimeout(() => setDebounced({ lat, lng }), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [lat, lng]);

  // Track last fetch position to enforce 500 m movement threshold
  const lastFetchPos = useRef<{ lat: number; lng: number } | null>(null);
  const queryClient = useQueryClient();

  // Compute the fetch key — only update when user moves > 500 m
  const [fetchPos, setFetchPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!debounced) return;
    const last = lastFetchPos.current;
    if (last && haversineKm(last.lat, last.lng, debounced.lat, debounced.lng) < MOVEMENT_THRESHOLD_KM) {
      return; // not far enough — skip
    }
    lastFetchPos.current = debounced;
    setFetchPos({ ...debounced });
  }, [debounced]);

  const enabled = fetchPos !== null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["places-foursquare", fetchPos?.lat, fetchPos?.lng, radiusM],
    queryFn: async () => {
      if (!fetchPos) return { places: [] as Place[], source: "none" as const };
      const params = new URLSearchParams({
        lat: String(fetchPos.lat),
        lng: String(fetchPos.lng),
        radius: String(radiusM),
        limit: "50",
      });
      const [fsqRes, geoRes] = await Promise.all([
        fetch(`/api/places/foursquare?${params}`),
        fetch(`/api/places/geoapify?${params}`),
      ]);
      const fsqData = fsqRes.ok
        ? ((await fsqRes.json()) as { places?: Place[]; source?: string })
        : { places: [] as Place[] };
      const geoData = geoRes.ok
        ? ((await geoRes.json()) as { places?: Place[]; source?: string })
        : { places: [] as Place[] };
      const fsqPlaces = fsqData.places ?? [];
      const geoPlaces = geoData.places ?? [];
      if (fsqPlaces.length > 0 || geoPlaces.length > 0) {
        const merged = new Map<string, Place>();
        for (const p of [...fsqPlaces, ...geoPlaces]) merged.set(p.id, p);
        const mergedPlaces = Array.from(merged.values())
          .sort((a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99))
          .slice(0, 30);
        const source = fsqPlaces.length >= geoPlaces.length
          ? ("foursquare" as const)
          : ("geoapify" as const);
        return { places: mergedPlaces, source };
      }

      // Fallback to app nearby places so the map still has local popups
      const nearbyParams = new URLSearchParams({
        lat: String(fetchPos.lat),
        lng: String(fetchPos.lng),
        radius: "12",
        limit: "30",
      });
      const nearbyRes = await fetch(`/api/places/nearby?${nearbyParams}`);
      if (!nearbyRes.ok) throw new Error(`places fallback api ${nearbyRes.status}`);
      const nearbyData = (await nearbyRes.json()) as { places?: Place[] };
      if ((nearbyData.places ?? []).length > 0) {
        return { places: nearbyData.places ?? [], source: "nearby" as const };
      }

      // Final fallback: Gemini landmarks -> Place shape for map labels/popups.
      const lmParams = new URLSearchParams({
        lat: String(fetchPos.lat),
        lng: String(fetchPos.lng),
      });
      const lmRes = await fetch(`/api/map/landmarks?${lmParams}`);
      if (!lmRes.ok) return { places: [] as Place[], source: "none" as const };
      const lmData = (await lmRes.json()) as {
        landmarks?: { id: string; name: string; category: string; description?: string; lat: number; lng: number }[];
      };
      const asCategory = (raw: string): PlaceCategory => {
        const c = String(raw).toLowerCase();
        if (c.includes("cafe")) return "cafe";
        if (c.includes("restaurant")) return "restaurant";
        if (c.includes("bar")) return "bar";
        if (c.includes("market")) return "market";
        if (c.includes("park")) return "park";
        if (c.includes("gallery") || c.includes("museum")) return "gallery";
        return "bookshop";
      };
      const placesFromLandmarks: Place[] = (lmData.landmarks ?? []).map((l) => ({
        id: `lm:${l.id}`,
        name: l.name,
        category: asCategory(l.category),
        description: l.description ?? null,
        address: "",
        arrondissement: "",
        lat: l.lat,
        lng: l.lng,
        image_url: null,
        tags: [String(l.category).toLowerCase()],
        opening_hours: null,
        price_range: null,
        website_url: null,
        instagram_url: null,
        is_featured: false,
        created_at: new Date().toISOString(),
        distance_km: haversineKm(fetchPos.lat, fetchPos.lng, l.lat, l.lng),
      }));
      return { places: placesFromLandmarks, source: "gemini_landmarks" as const };
    },
    enabled,
    staleTime: STALE_MS,
    retry: 1,
  });

  // Prefetch next area when user has a position but hasn't moved yet
  useEffect(() => {
    if (!debounced || !enabled) return;
    const params = new URLSearchParams({
      lat: String(debounced.lat),
      lng: String(debounced.lng),
      radius: String(radiusM),
      limit: "50",
    });
    queryClient.prefetchQuery({
      queryKey: ["places-foursquare", debounced.lat, debounced.lng, radiusM],
      queryFn: () =>
        fetch(`/api/places/foursquare?${params}`)
          .then((r) => r.json())
          .catch(() => ({ places: [] })),
      staleTime: STALE_MS,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced?.lat, debounced?.lng]);

  return {
    places: data?.places ?? [],
    loading: isLoading,
    error: isError ? "Failed to load nearby places" : null,
    source: data?.source ?? "none",
  };
}
