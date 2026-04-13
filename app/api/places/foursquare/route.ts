/**
 * GET /api/places/foursquare
 *
 * Fetches nearby places from Foursquare Places API v3 and transforms them
 * into our Place shape with trending scores applied.
 *
 * Query params:
 *   lat      number  required
 *   lng      number  required
 *   radius   number  meters, default 2000, max 3000
 *   limit    number  default 50, max 50
 *
 * Caching: in-memory, 12-minute TTL, keyed by rounded lat/lng + radius.
 * Falls back to empty array when FOURSQUARE_API_KEY is not set.
 */

import { NextRequest, NextResponse } from "next/server";
import { haversineKm } from "@/lib/geo";
import { getCached, setCached, geoKey } from "@/lib/placeCache";
import { fsCategoryToPlaceCategory, trendingScore } from "@/utils/mapHelpers";
import type { Place, PlaceCategory } from "@/types";

export const dynamic = "force-dynamic";

// Foursquare v3 category IDs to request — cafes, bars, restaurants, nightlife, parks, libraries, arts, markets
const FS_CATEGORY_IDS = [
  "13030", "13032", "13033", // cafes
  "13003", "13058", "13059", // bars
  "13065", "13029",           // restaurants / food
  "10032", "10033",           // nightlife / music venues
  "16032", "16000", "16019", "16021", "16022", "16026", "16011", // parks, gardens, nature, playgrounds
  "12068", "12051", "12043", // libraries
  "12000", "12002",           // art / gallery
  "17045",                    // food market
  "13002", "13011",           // bakeries
].join(",");

// ─── Foursquare response types ────────────────────────────────────────────────

interface FsCategory {
  id: number;
  name: string;
}

interface FsPlace {
  fsq_id: string;
  name: string;
  categories: FsCategory[];
  geocodes?: {
    main?: { latitude: number; longitude: number };
  };
  location?: {
    formatted_address?: string;
    locality?: string;
    neighborhood?: string[];
    admin_region?: string;
  };
  distance?: number; // metres from query point
  rating?: number;   // 0–10 (optional, needs premium plan for some venues)
  popularity?: number; // 0–1
}

interface FsSearchResponse {
  results: FsPlace[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fsPlaceToPlace(fp: FsPlace, userLat: number, userLng: number): Place | null {
  const coords = fp.geocodes?.main;
  if (!coords) return null;

  const distKm = haversineKm(userLat, userLng, coords.latitude, coords.longitude);
  const rating = fp.rating ?? 7.0; // default mid-range if not provided
  const score = trendingScore(rating, distKm);
  const category: PlaceCategory = fsCategoryToPlaceCategory(fp.categories);

  const locality =
    fp.location?.neighborhood?.[0] ??
    fp.location?.locality ??
    fp.location?.admin_region ??
    "";

  return {
    id: `fsq:${fp.fsq_id}`,
    name: fp.name,
    category,
    description: null,
    address: fp.location?.formatted_address ?? "",
    arrondissement: locality,
    lat: coords.latitude,
    lng: coords.longitude,
    image_url: null,
    tags: fp.categories.map((c) => c.name.toLowerCase()),
    opening_hours: null,
    price_range: null,
    website_url: null,
    instagram_url: null,
    is_featured: score > 0.75,
    created_at: new Date().toISOString(),
    distance_km: distKm,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required", places: [] }, { status: 400 });
  }

  let radius = Number(sp.get("radius") ?? 2000);
  if (!Number.isFinite(radius)) radius = 2000;
  radius = Math.min(3000, Math.max(500, radius));

  let limit = Number(sp.get("limit") ?? 50);
  if (!Number.isFinite(limit)) limit = 50;
  limit = Math.min(50, Math.max(1, limit));

  const apiKey = process.env.FOURSQUARE_API_KEY?.trim();

  // Graceful no-op when key is not configured
  if (!apiKey) {
    return NextResponse.json({
      places: [] as Place[],
      source: "foursquare",
      configured: false,
    });
  }

  // ── Cache lookup ──────────────────────────────────────────────────────────
  const cacheK = geoKey(lat, lng, radius, "fs");
  const cached = getCached<Place[]>(cacheK);
  if (cached) {
    return NextResponse.json({ places: cached, source: "foursquare", cached: true });
  }

  // ── Call Foursquare v3 ────────────────────────────────────────────────────
  const url = new URL("https://api.foursquare.com/v3/places/search");
  url.searchParams.set("ll", `${lat},${lng}`);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("categories", FS_CATEGORY_IDS);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("fields", "fsq_id,name,categories,geocodes,location,distance,rating,popularity");

  let fsPlaces: FsPlace[] = [];
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: apiKey,
        Accept: "application/json",
      },
      // 8-second timeout
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`[foursquare] HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      return NextResponse.json({ places: [] as Place[], source: "foursquare", error: `HTTP ${res.status}` });
    }

    const data = (await res.json()) as FsSearchResponse;
    fsPlaces = data.results ?? [];
  } catch (err) {
    console.error("[foursquare] fetch error:", err);
    return NextResponse.json({ places: [] as Place[], source: "foursquare", error: "fetch_failed" });
  }

  // ── Transform + sort by trending score ───────────────────────────────────
  const places = fsPlaces
    .map((fp) => fsPlaceToPlace(fp, lat, lng))
    .filter((p): p is Place => p !== null)
    .sort((a, b) => {
      const scoreA = trendingScore((a.is_featured ? 8.5 : 7), a.distance_km ?? 99);
      const scoreB = trendingScore((b.is_featured ? 8.5 : 7), b.distance_km ?? 99);
      return scoreB - scoreA;
    });

  // Cache for 12 minutes
  setCached(cacheK, places);

  return NextResponse.json({ places, source: "foursquare", cached: false, total: places.length });
}
