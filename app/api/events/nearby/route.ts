import { NextRequest, NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { bboxDeltas, haversineKm } from "@/lib/geo";
import { sortByDistanceThenTime } from "@/lib/api/eventSort";
import type { Event } from "@/types";

export const dynamic = "force-dynamic";

const MAX_FETCH = 500;

export async function GET(req: NextRequest) {
  const supabase = getPublicSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured", events: [] as Event[] },
      { status: 503 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "Invalid or missing lat/lng", events: [] as Event[] },
      { status: 400 }
    );
  }

  let radiusKm = Number(sp.get("radius") ?? 5);
  if (!Number.isFinite(radiusKm)) radiusKm = 5;
  radiusKm = Math.min(30, Math.max(0.5, radiusKm));

  let limit = Number.parseInt(sp.get("limit") ?? "40", 10);
  if (!Number.isFinite(limit)) limit = 40;
  limit = Math.min(50, Math.max(1, limit));

  const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0);

  const { dLat, dLng } = bboxDeltas(lat, radiusKm * 1.2);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("status", "active")
    .gt("start_time", nowIso)
    .gte("lat", lat - dLat)
    .lte("lat", lat + dLat)
    .gte("lng", lng - dLng)
    .lte("lng", lng + dLng)
    .order("start_time", { ascending: true })
    .limit(MAX_FETCH);

  if (error) {
    return NextResponse.json({ error: error.message, events: [] as Event[] }, { status: 500 });
  }

  const rows = (data ?? []) as Event[];
  const inRadius = rows
    .map((e) => ({ e, d: haversineKm(lat, lng, e.lat, e.lng) }))
    .filter((x) => x.d <= radiusKm);

  const sorted = sortByDistanceThenTime(
    inRadius.map((x) => x.e),
    lat,
    lng
  );
  const page = sorted.slice(offset, offset + limit);

  return NextResponse.json({
    events: page,
    total: sorted.length,
    offset,
    limit,
  });
}
