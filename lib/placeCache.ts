/**
 * Server-side in-memory TTL cache.
 * Uses a plain Map so entries survive across requests in the same Node.js process
 * (i.e., across multiple calls within a Next.js dev server or production instance).
 *
 * NOTE: This is process-local — not shared across multiple serverless instances.
 * For true multi-instance sharing, swap the Map for Redis. TTL default: 12 minutes.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 12 * 60 * 1000; // 12 minutes

/** Returns cached value if it exists and has not expired, else null. */
export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

/** Stores a value with an optional TTL (defaults to 12 minutes). */
export function setCached<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Removes a specific key. */
export function deleteCached(key: string): void {
  store.delete(key);
}

/** Removes all expired entries (call periodically to avoid memory leaks). */
export function pruneExpired(): void {
  const now = Date.now();
  const keys = Array.from(store.keys());
  for (const key of keys) {
    const entry = store.get(key);
    if (entry && now > entry.expiresAt) store.delete(key);
  }
}

/** Builds a normalised cache key for lat/lng queries (rounds to ~1 km grid). */
export function geoKey(lat: number, lng: number, ...parts: (string | number)[]): string {
  const rLat = Math.round(lat * 100) / 100;
  const rLng = Math.round(lng * 100) / 100;
  return [rLat, rLng, ...parts].join(":");
}
