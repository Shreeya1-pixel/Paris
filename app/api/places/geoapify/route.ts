import { NextRequest, NextResponse } from "next/server";
import { haversineKm } from "@/lib/geo";
import { getCached, setCached, geoKey } from "@/lib/placeCache";
import type { Place, PlaceCategory } from "@/types";

export const dynamic = "force-dynamic";

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

interface GeoapifyResponse {
  features?: {
    properties?: GeoapifyPlace;
  }[];
}

function mapGeoCategory(cats: string[] | undefined): PlaceCategory {
  const c = (cats ?? []).join(" ").toLowerCase();
  if (c.includes("catering.cafe")) return "cafe";
  if (c.includes("catering.restaurant") || c.includes("catering.fast_food")) return "restaurant";
  if (c.includes("catering.bar") || c.includes("pub")) return "bar";
  if (c.includes("commercial.supermarket") || c.includes("commercial.market")) return "market";
  if (c.includes("entertainment.nightclub")) return "club";
  if (c.includes("education.library")) return "library";
  if (c.includes("entertainment.museum") || c.includes("entertainment.gallery")) return "gallery";
  if (c.includes("leisure.park")) return "park";
  if (c.includes("commercial.books")) return "bookshop";
  if (c.includes("catering.bakery")) return "boulangerie";
  return "restaurant";
}

function isNoisePlaceName(name: string): boolean {
  const n = name.toLowerCase();
  // Hide administrative/locality-like labels to keep the map clean.
  return (
    n.includes("colony") ||
    n.includes("tehsil") ||
    n.includes("district") ||
    n.includes("municipal") ||
    n.includes("ward office") ||
    n.includes("hospital")
  );
}

function toPlace(p: GeoapifyPlace, userLat: number, userLng: number): Place | null {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  const lat = Number(p.lat);
  const lng = Number(p.lon);
  const distance_km = haversineKm(userLat, userLng, lat, lng);
  const category = mapGeoCategory(p.categories);
  const label = p.name?.trim() || p.formatted?.split(",")[0]?.trim() || "Nearby place";
  if (isNoisePlaceName(label)) return null;
  return {
    id: `geo:${p.place_id ?? `${lat.toFixed(5)}:${lng.toFixed(5)}:${label}`}`,
    name: label,
    category,
    description: null,
    address: p.formatted ?? "",
    arrondissement: p.suburb ?? p.city ?? "",
    lat,
    lng,
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

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required", places: [] as Place[] }, { status: 400 });
  }

  let limit = Number(sp.get("limit") ?? 20);
  if (!Number.isFinite(limit)) limit = 20;
  limit = Math.min(30, Math.max(1, limit));

  let radius = Number(sp.get("radius") ?? 5000);
  if (!Number.isFinite(radius)) radius = 5000;
  radius = Math.min(20000, Math.max(500, radius));

  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ places: [] as Place[], source: "geoapify", configured: false });
  }

  const cacheK = geoKey(lat, lng, radius, "ga", "open");
  const cached = getCached<Place[]>(cacheK);
  if (cached) {
    return NextResponse.json({ places: cached, source: "geoapify", cached: true });
  }

  const url = new URL("https://api.geoapify.com/v2/places");
  url.searchParams.set(
    "categories",
    [
      "catering",
      "catering.cafe",
      "catering.restaurant",
      "catering.bar",
      "commercial.supermarket",
      "commercial.marketplace",
      "entertainment",
      "education.library",
      "leisure.park",
      "commercial.books",
    ].join(",")
  );
  url.searchParams.set("filter", `circle:${lng},${lat},${radius}`);
  url.searchParams.set("bias", `proximity:${lng},${lat}`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("conditions", "open_now");
  url.searchParams.set("apiKey", apiKey);

  let features: GeoapifyResponse["features"] = [];
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { places: [] as Place[], source: "geoapify", error: `HTTP ${res.status}`, detail: text.slice(0, 180) },
        { status: 200 }
      );
    }
    const data = (await res.json()) as GeoapifyResponse;
    features = data.features ?? [];
  } catch {
    return NextResponse.json({ places: [] as Place[], source: "geoapify", error: "fetch_failed" });
  }

  const places = features
    .map((f) => toPlace(f.properties ?? {}, lat, lng))
    .filter((p): p is Place => p !== null)
    .sort((a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99))
    .slice(0, limit);

  setCached(cacheK, places);
  return NextResponse.json({ places, source: "geoapify", cached: false, total: places.length });
}
