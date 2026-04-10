/**
 * In-memory feed cache — 3-minute TTL.
 *
 * Cache key: userId (or "anon") + rounded lat/lng (1 decimal → ~10 km grid).
 * Avoids recomputing the ranked feed on every render refresh.
 */

import type { Event } from "@/types";

const TTL_MS = Number(process.env.FEED_CACHE_TTL_MS ?? 3 * 60 * 1000);

interface FeedEntry {
  events: Event[];
  cachedAt: number;
  isPersonalised: boolean;
}

const store = new Map<string, FeedEntry>();

let reads = 0;
function maybeEvict(): void {
  if (++reads < 100) return;
  reads = 0;
  const now = Date.now();
  Array.from(store.entries()).forEach(([k, v]) => {
    if (now - v.cachedAt > TTL_MS) store.delete(k);
  });
}

export function buildFeedCacheKey(
  userId: string | null,
  lat: number,
  lng: number
): string {
  const uid   = userId ?? "anon";
  const rLat  = lat.toFixed(1);  // ~10 km grid
  const rLng  = lng.toFixed(1);
  return `${uid}:${rLat}:${rLng}`;
}

export function getCachedFeed(key: string): FeedEntry | null {
  maybeEvict();
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function setCachedFeed(
  key: string,
  events: Event[],
  isPersonalised: boolean
): void {
  store.set(key, { events, cachedAt: Date.now(), isPersonalised });
}

/** Invalidate cache for a user (call after they save an event). */
export function invalidateFeedForUser(userId: string): void {
  Array.from(store.keys()).forEach((k) => {
    if (k.startsWith(userId + ":")) store.delete(k);
  });
}
