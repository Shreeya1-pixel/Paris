/**
 * In-memory response cache for /api/ai/recommend.
 *
 * Cache key components:
 *   • lat/lng rounded to 2 decimal places (~1 km precision)
 *   • vibe string (empty string if none)
 *   • time bucket: "morning" | "afternoon" | "evening" (Paris TZ)
 *
 * TTL: 10 minutes.  Goal: cut Gemini calls by ≥70% for repeat
 * requests from the same neighbourhood in the same session.
 */

import type { RecommendItem } from "@/lib/ai/recommendTypes";

// ─── Config ───────────────────────────────────────────────────────────────────

const TTL_MS = Number(process.env.AI_CACHE_TTL_MS ?? 10 * 60 * 1000);

// ─── Time bucket (Paris local time) ──────────────────────────────────────────

export type TimeBucket = "morning" | "afternoon" | "evening";

export function getTimeBucket(date: Date = new Date()): TimeBucket {
  // Convert to Paris local hour
  const h = new Date(
    date.toLocaleString("en-US", { timeZone: "Europe/Paris" })
  ).getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  return "evening";
}

// ─── Key builder ─────────────────────────────────────────────────────────────

export function buildCacheKey(
  lat: number,
  lng: number,
  vibe: string,
  bucket?: TimeBucket
): string {
  const rLat = lat.toFixed(2);
  const rLng = lng.toFixed(2);
  const b = bucket ?? getTimeBucket();
  return `${rLat}:${rLng}:${vibe.toLowerCase().trim() || "any"}:${b}`;
}

// ─── Cache store ──────────────────────────────────────────────────────────────

interface CacheEntry {
  items: RecommendItem[];
  message: string;
  cachedAt: number;
  fromFallback: boolean;
}

const store = new Map<string, CacheEntry>();

// Prune expired entries periodically (every 200 reads)
let reads = 0;
function maybeEvict(): void {
  if (++reads < 200) return;
  reads = 0;
  const now = Date.now();
  Array.from(store.entries()).forEach(([k, v]) => {
    if (now - v.cachedAt > TTL_MS) store.delete(k);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getCached(key: string): CacheEntry | null {
  maybeEvict();
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function setCached(
  key: string,
  items: RecommendItem[],
  message: string,
  fromFallback: boolean
): void {
  store.set(key, {
    items,
    message,
    cachedAt: Date.now(),
    fromFallback,
  });
}
