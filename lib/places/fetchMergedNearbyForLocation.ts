/**
 * Server-only: load nearby places from Foursquare + Geoapify (user location — no static Paris DB).
 */

import { haversineKm } from "@/lib/geo";
import { fsCategoryToPlaceCategory, trendingScore } from "@/utils/mapHelpers";
import type { Place, PlaceCategory } from "@/types";

const FS_CATEGORY_IDS = [
  "13030", "13032", "13033",
  "13003", "13058", "13059",
  "13065", "13029",
  "10032", "10033",
  "16032", "16000", "16019", "16021", "16022", "16026", "16011",
  "12068", "12051", "12043",
  "12000", "12002",
  "17045",
  "13002", "13011",
  "17069", "17088", "17050",
].join(",");

interface FsCategory {
  id: number;
  name: string;
}
interface FsPlace {
  fsq_id: string;
  name: string;
  categories: FsCategory[];
  geocodes?: { main?: { latitude: number; longitude: number } };
  location?: {
    formatted_address?: string;
    locality?: string;
    neighborhood?: string[];
    admin_region?: string;
  };
  rating?: number;
}

function fsToPlace(fp: FsPlace, userLat: number, userLng: number): Place | null {
  const coords = fp.geocodes?.main;
  if (!coords) return null;
  const distKm = haversineKm(userLat, userLng, coords.latitude, coords.longitude);
  const rating = fp.rating ?? 7.0;
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

function mapGeoCategory(cats: string[] | undefined): PlaceCategory {
  const c = (cats ?? []).join(" ").toLowerCase();
  if (c.includes("catering.cafe")) return "cafe";
  if (c.includes("catering.restaurant") || c.includes("catering.fast_food")) return "restaurant";
  if (c.includes("catering.bar") || c.includes("pub")) return "bar";
  if (c.includes("commercial.supermarket") || c.includes("commercial.market")) return "market";
  if (c.includes("commercial.convenience")) return "market";
  if (c.includes("entertainment.nightclub")) return "club";
  if (c.includes("education.library")) return "library";
  if (c.includes("entertainment.museum") || c.includes("entertainment.gallery")) return "gallery";
  if (c.includes("leisure.park")) return "park";
  if (c.includes("commercial.books")) return "bookshop";
  if (c.includes("catering.bakery")) return "boulangerie";
  return "restaurant";
}

function geoNoise(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("colony") ||
    n.includes("tehsil") ||
    n.includes("district") ||
    n.includes("municipal") ||
    n.includes("ward office") ||
    n.includes("hospital")
  );
}

interface GeoapifyPlace {
  place_id?: string;
  name?: string;
  formatted?: string;
  lat?: number;
  lon?: number;
  categories?: string[];
  city?: string;
  suburb?: string;
}

function geoToPlace(p: GeoapifyPlace, userLat: number, userLng: number): Place | null {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  const la = Number(p.lat);
  const ln = Number(p.lon);
  const distance_km = haversineKm(userLat, userLng, la, ln);
  const category = mapGeoCategory(p.categories);
  const label = p.name?.trim() || p.formatted?.split(",")[0]?.trim() || "Nearby place";
  if (geoNoise(label)) return null;
  return {
    id: `geo:${p.place_id ?? `${la.toFixed(5)}:${ln.toFixed(5)}:${label}`}`,
    name: label,
    category,
    description: null,
    address: p.formatted ?? "",
    arrondissement: p.suburb ?? p.city ?? "",
    lat: la,
    lng: ln,
    image_url: null,
    tags: p.categories ?? [],
    opening_hours: null,
    price_range: null,
    website_url: null,
    instagram_url: null,
    is_featured: distance_km < 1.5,
    created_at: new Date().toISOString(),
    distance_km,
  };
}

export type MergedNearbyOptions = {
  /** Foursquare search radius (m), default 3000 */
  radiusFsqM?: number;
  /** Geoapify circle radius (m), default 5000 */
  radiusGeoM?: number;
  /** Max results after merge */
  resultLimit?: number;
};

/**
 * Returns places sorted by distance from (lat,lng). Empty if no API keys or errors.
 */
export async function fetchMergedNearbyForLocation(
  lat: number,
  lng: number,
  opts: MergedNearbyOptions = {}
): Promise<Place[]> {
  const radiusFsq = Math.min(3000, Math.max(500, opts.radiusFsqM ?? 3000));
  const radiusGeo = Math.min(20000, Math.max(500, opts.radiusGeoM ?? 5000));
  const resultLimit = Math.min(120, Math.max(10, opts.resultLimit ?? 60));

  const fsqKey = process.env.FOURSQUARE_API_KEY?.trim();
  const geoKey = process.env.GEOAPIFY_API_KEY?.trim();

  const tasks: Promise<Place[]>[] = [];

  if (fsqKey) {
    tasks.push(
      (async () => {
        try {
          const url = new URL("https://api.foursquare.com/v3/places/search");
          url.searchParams.set("ll", `${lat},${lng}`);
          url.searchParams.set("radius", String(radiusFsq));
          url.searchParams.set("categories", FS_CATEGORY_IDS);
          url.searchParams.set("limit", "50");
          url.searchParams.set("open_now", "true");
          url.searchParams.set(
            "fields",
            "fsq_id,name,categories,geocodes,location,distance,rating,popularity"
          );
          const res = await fetch(url.toString(), {
            headers: { Authorization: fsqKey, Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return [];
          const data = (await res.json()) as { results?: FsPlace[] };
          return (data.results ?? [])
            .map((fp) => fsToPlace(fp, lat, lng))
            .filter((p): p is Place => p !== null);
        } catch {
          return [];
        }
      })()
    );
  } else {
    tasks.push(Promise.resolve([]));
  }

  if (geoKey) {
    tasks.push(
      (async () => {
        try {
          const url = new URL("https://api.geoapify.com/v2/places");
          url.searchParams.set(
            "categories",
            [
              "catering",
              "catering.cafe",
              "catering.restaurant",
              "catering.bar",
              "commercial.supermarket",
              "commercial.convenience",
              "commercial.marketplace",
              "entertainment",
              "education.library",
              "leisure.park",
              "commercial.books",
            ].join(",")
          );
          url.searchParams.set("filter", `circle:${lng},${lat},${radiusGeo}`);
          url.searchParams.set("bias", `proximity:${lng},${lat}`);
          url.searchParams.set("limit", "40");
          url.searchParams.set("conditions", "open_now");
          url.searchParams.set("apiKey", geoKey);
          const res = await fetch(url.toString(), {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return [];
          const data = (await res.json()) as {
            features?: { properties?: GeoapifyPlace }[];
          };
          return (data.features ?? [])
            .map((f) => geoToPlace(f.properties ?? {}, lat, lng))
            .filter((p): p is Place => p !== null);
        } catch {
          return [];
        }
      })()
    );
  } else {
    tasks.push(Promise.resolve([]));
  }

  const [fsqPlaces, geoPlaces] = await Promise.all(tasks);
  const merged = new Map<string, Place>();
  for (const p of [...fsqPlaces, ...geoPlaces]) merged.set(p.id, p);
  return Array.from(merged.values())
    .sort((a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99))
    .slice(0, resultLimit);
}
