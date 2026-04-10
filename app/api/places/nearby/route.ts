import { NextRequest, NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { bboxDeltas, haversineKm } from "@/lib/geo";
import type { Place, PlaceCategory } from "@/types";

export const dynamic = "force-dynamic";

const MAX_FETCH = 300;

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
  const supabase = getPublicSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured", places: [] as Place[] },
      { status: 503 }
    );
  }

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

  const { dLat, dLng } = bboxDeltas(lat, radiusKm * 1.2);

  const catRaw = sp.get("categories")?.trim();
  const categories = catRaw
    ? catRaw
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter((c) => ALLOWED.has(c))
    : null;

  let q = supabase
    .from("paris_places")
    .select("*")
    .gte("lat", lat - dLat)
    .lte("lat", lat + dLat)
    .gte("lng", lng - dLng)
    .lte("lng", lng + dLng);

  if (categories && categories.length > 0) {
    q = q.in("category", categories);
  }

  const { data, error } = await q.limit(MAX_FETCH);

  if (error) {
    return NextResponse.json({ error: error.message, places: [] as Place[] }, { status: 500 });
  }

  const rows = (data ?? []) as Place[];
  const withDist = rows
    .map((p) => ({ p, d: haversineKm(lat, lng, p.lat, p.lng) }))
    .filter((x) => x.d <= radiusKm)
    .sort((a, b) => a.d - b.d);

  const page = withDist.slice(offset, offset + limit).map(({ p, d }) => ({ ...p, distance_km: d }));

  return NextResponse.json({
    places: page,
    total: withDist.length,
    offset,
    limit,
  });
}
