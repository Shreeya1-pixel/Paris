import type { Event } from "@/types";
import { haversineKm } from "@/lib/geo";

/** Sort by distance, then soonest start_time (stable for feeds). */
export function sortByDistanceThenTime(
  events: Event[],
  lat: number,
  lng: number
): Event[] {
  return [...events]
    .map((e) => ({
      e,
      d: haversineKm(lat, lng, e.lat, e.lng),
      t: new Date(e.start_time).getTime(),
    }))
    .sort((a, b) => a.d - b.d || a.t - b.t)
    .map(({ e, d }) => ({ ...e, distance_km: d }));
}

/**
 * Feed tier: near (≤5km) + starting within 24h first, then nearer / sooner.
 * When all events are far away (global fallback), tiers are recalculated
 * relative to the closest event so nothing is buried.
 */
export function sortFeedPriority(events: Event[], lat: number, lng: number): Event[] {
  if (events.length === 0) return [];

  const now = Date.now();
  const horizon = now + 24 * 60 * 60 * 1000;

  const scored = events.map((e) => {
    const d = haversineKm(lat, lng, e.lat, e.lng);
    const start = new Date(e.start_time).getTime();
    const in24h = start >= now && start <= horizon;
    const near = d <= 5;
    let tier = 3;
    if (near && in24h) tier = 0;
    else if (near) tier = 1;
    else if (d <= 10) tier = 2;
    else tier = 3;
    return { e, d, tier, start };
  });

  // If everything lands in tier 3 (all far away), re-tier relative to the nearest event
  const hasCloser = scored.some((s) => s.tier < 3);
  if (!hasCloser) {
    const minDist = Math.min(...scored.map((s) => s.d));
    for (const s of scored) {
      const relDist = s.d - minDist;
      s.tier = relDist <= 5 ? 0 : relDist <= 20 ? 1 : 2;
    }
  }

  return scored
    .sort((a, b) => a.tier - b.tier || a.d - b.d || a.start - b.start)
    .map(({ e, d }) => ({ ...e, distance_km: d }));
}
