import { NextRequest, NextResponse } from "next/server";
import { haversineKm } from "@/lib/geo";
import { fetchMergedNearbyForLocation } from "@/lib/places/fetchMergedNearbyForLocation";
import type { Place, PlaceCategory } from "@/types";

export const dynamic = "force-dynamic";

const ALLOWED_CATS: PlaceCategory[] = [
  "cafe",
  "restaurant",
  "bar",
  "boulangerie",
  "gallery",
  "park",
  "market",
  "club",
  "bookshop",
];
const ALLOWED = new Set<string>(ALLOWED_CATS);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "Invalid or missing lat/lng", places: [] as Place[] },
      { status: 400 }
    );
  }

  let radiusKm = Number(sp.get("radius") ?? 5);
  if (!Number.isFinite(radiusKm)) radiusKm = 5;
  radiusKm = Math.min(30, Math.max(0.5, radiusKm));

  let limit = Number.parseInt(sp.get("limit") ?? "30", 10);
  if (!Number.isFinite(limit)) limit = 30;
  limit = Math.min(50, Math.max(1, limit));

  const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0);

  const catRaw = sp.get("categories")?.trim();
  const categories = catRaw
    ? catRaw
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter((c) => ALLOWED.has(c))
    : null;

  const radiusFsqM = Math.min(20000, Math.max(500, radiusKm * 1000 * 1.15));
  const radiusGeoM = Math.min(20000, Math.max(500, radiusKm * 1000 * 1.25));

  const merged = await fetchMergedNearbyForLocation(lat, lng, {
    resultLimit: Math.min(120, offset + limit + 40),
    radiusFsqM,
    radiusGeoM,
  });

  let rows = merged
    .map((p) => ({ p, d: p.distance_km ?? haversineKm(lat, lng, p.lat, p.lng) }))
    .filter((x) => x.d <= radiusKm)
    .sort((a, b) => a.d - b.d)
    .map(({ p, d }) => ({ ...p, distance_km: d }));

  if (categories && categories.length > 0) {
    rows = rows.filter((p) => categories.includes(p.category));
  }

  const page = rows.slice(offset, offset + limit);

  return NextResponse.json({
    places: page,
    total: rows.length,
    offset,
    limit,
  });
}
