"use client";

/**
 * usePlaces — fetches nearby places from /api/places/foursquare with:
 *  - 500 ms debounce on lat/lng changes
 *  - 500 m movement threshold: skip re-fetch if user hasn't moved enough
 *  - React Query for client-side caching & deduplication
 *  - Graceful fallback when Foursquare key is absent (returns empty array)
 */

import { useRef, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Place } from "@/types";
import { haversineKm } from "@/lib/geo";

const DEBOUNCE_MS = 500;
const MOVEMENT_THRESHOLD_KM = 0.5;
const RADIUS_M = 2000;
const STALE_MS = 12 * 60 * 1000; // matches server-side TTL

export interface UsePlacesResult {
  places: Place[];
  loading: boolean;
  error: string | null;
  /** "foursquare" when the API is configured, "none" otherwise */
  source: "foursquare" | "none";
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
      const res = await fetch(`/api/places/foursquare?${params}`);
      if (!res.ok) throw new Error(`foursquare api ${res.status}`);
      return res.json() as Promise<{ places: Place[]; source: string; configured?: boolean }>;
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
    source: (data?.source as "foursquare") ?? "none",
  };
}
