/**
 * Map utility helpers — trending score, Foursquare category mapping,
 * grid-based clustering, and zoom-aware display logic.
 */

import type { PlaceCategory } from "@/types";

// ─── Trending Score ────────────────────────────────────────────────────────────

/**
 * Blends Foursquare rating (0–10) with proximity into a single 0–1 score.
 *   score = (rating * 0.6) + (distanceScore * 0.4)
 * where distanceScore = 1 − clamp(distanceKm / maxRadiusKm, 0, 1)
 */
export function trendingScore(
  rating: number,
  distanceKm: number,
  maxRadiusKm: number = 2
): number {
  const normRating = Math.max(0, Math.min(10, rating)) / 10;
  const distanceScore = Math.max(0, 1 - distanceKm / maxRadiusKm);
  return normRating * 0.6 + distanceScore * 0.4;
}

// ─── Foursquare v3 Category → PlaceCategory ────────────────────────────────────

/** Foursquare v3 category ID → our PlaceCategory */
const FS_CAT_MAP: Record<number, PlaceCategory> = {
  // Cafes
  13030: "cafe",
  13032: "cafe",
  13033: "cafe",
  13034: "cafe", // coffee roaster
  // Bars
  13003: "bar",
  13058: "bar", // cocktail bar
  13059: "bar", // wine bar
  13060: "bar", // beer bar
  13062: "bar", // lounge bar
  // Restaurants
  13065: "restaurant",
  13064: "restaurant", // fast food
  13067: "restaurant", // burger joint
  13066: "restaurant", // diner
  13068: "restaurant", // French restaurant
  13029: "restaurant", // food (general)
  13040: "restaurant", // indian
  13099: "restaurant", // pizza
  13236: "restaurant", // sushi
  // Clubs / nightlife
  10032: "club",
  10033: "club", // music venue
  10009: "club", // comedy club
  // Parks & outdoors
  16032: "park",
  16000: "park",
  16019: "park", // garden
  16021: "park", // national park
  16022: "park", // nature preserve
  16026: "park", // playground
  16020: "park", // historic & protected site
  16011: "park", // botanical garden
  // Libraries
  12068: "library",
  12051: "library", // educational institution / library
  12043: "library", // public library
  // Galleries / arts
  12000: "gallery",
  12002: "gallery", // art gallery
  12005: "gallery", // art museum
  // Markets / shops
  17000: "market",
  17045: "market", // food market
  // Bakeries
  13002: "boulangerie",
  13011: "boulangerie", // bakery
  // Bookshops
  17018: "bookshop",
};

interface FsCategory {
  id: number;
  name: string;
}

export function fsCategoryToPlaceCategory(categories: FsCategory[]): PlaceCategory {
  for (const cat of categories) {
    const mapped = FS_CAT_MAP[cat.id];
    if (mapped) return mapped;
  }
  // Name-based fallback
  const name = (categories[0]?.name ?? "").toLowerCase();
  if (name.includes("café") || name.includes("cafe") || name.includes("coffee")) return "cafe";
  if (name.includes("bar") || name.includes("wine") || name.includes("cocktail")) return "bar";
  if (name.includes("restaurant") || name.includes("bistro") || name.includes("brasserie")) return "restaurant";
  if (name.includes("club") || name.includes("nightlife") || name.includes("disco")) return "club";
  if (name.includes("park") || name.includes("garden") || name.includes("outdoor") || name.includes("nature") || name.includes("playground")) return "park";
  if (name.includes("library") || name.includes("bibliothèque") || name.includes("mediatheque") || name.includes("médiathèque")) return "library";
  if (name.includes("gallery") || name.includes("museum") || name.includes("art")) return "gallery";
  if (name.includes("bakery") || name.includes("boulangerie") || name.includes("patisserie")) return "boulangerie";
  if (name.includes("book")) return "bookshop";
  if (name.includes("market") || name.includes("shop") || name.includes("store")) return "market";
  return "restaurant";
}

// ─── Cluster places into grid cells ───────────────────────────────────────────

export interface PlaceCluster {
  lat: number;
  lng: number;
  count: number;
  topPlaceId: string;
  topCategory: PlaceCategory;
  ids: string[];
}

/**
 * Groups places into a geographic grid of `cellDeg` degree cells.
 * Returns clusters with ≥ 2 members (singletons remain as regular markers).
 */
export function clusterPlaces<T extends { id: string; lat: number; lng: number; category: PlaceCategory }>(
  places: T[],
  cellDeg: number
): { clusters: PlaceCluster[]; singletons: T[] } {
  const bucket = new Map<string, { places: T[]; sumLat: number; sumLng: number }>();

  for (const p of places) {
    const kLat = Math.round(p.lat / cellDeg);
    const kLng = Math.round(p.lng / cellDeg);
    const key = `${kLat}:${kLng}`;
    const existing = bucket.get(key);
    if (!existing) {
      bucket.set(key, { places: [p], sumLat: p.lat, sumLng: p.lng });
    } else {
      existing.places.push(p);
      existing.sumLat += p.lat;
      existing.sumLng += p.lng;
    }
  }

  const clusters: PlaceCluster[] = [];
  const singletons: T[] = [];

  const groups = Array.from(bucket.values());
  for (const group of groups) {
    if (group.places.length < 2) {
      singletons.push(...group.places);
    } else {
      const count = group.places.length;
      clusters.push({
        lat: group.sumLat / count,
        lng: group.sumLng / count,
        count,
        topPlaceId: group.places[0].id,
        topCategory: group.places[0].category,
        ids: group.places.map((p: T) => p.id),
      });
    }
  }

  return { clusters, singletons };
}

// ─── Zoom-based cell size ──────────────────────────────────────────────────────

/**
 * Returns the grid cell size (in degrees) to use for clustering at a given zoom level.
 * Larger cells → more aggressive clustering (for low zoom levels).
 */
export function clusterCellForZoom(zoom: number): number {
  if (zoom < 8) return 2.0;
  if (zoom < 10) return 0.5;
  if (zoom < 11) return 0.15;
  if (zoom < 12) return 0.06;
  return 0.02; // below this, singletons dominate
}

/**
 * At this zoom level and above, show full expanded labels.
 * Below: compact dot only.
 */
export const LABEL_ZOOM_THRESHOLD = 12;

/**
 * At this zoom level and below, apply grid clustering.
 */
export const CLUSTER_ZOOM_THRESHOLD = 11;
