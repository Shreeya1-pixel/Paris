import { NextRequest, NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { bboxDeltas, haversineKm } from "@/lib/geo";
import type { Event, NearbyMapItem, Place } from "@/types";

export const dynamic = "force-dynamic";

const MAX_FETCH = 240;
const MAX_LIMIT = 30;

export async function GET(req: NextRequest) {
  const supabase = getPublicSupabase();
  if (!supabase) {
    return NextResponse.json(
      {
        error: "Supabase not configured",
        items: [] as NearbyMapItem[],
        events: [] as Event[],
        places: [] as Place[],
      },
      { status: 503 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      {
        error: "Invalid or missing lat/lng",
        items: [] as NearbyMapItem[],
        events: [] as Event[],
        places: [] as Place[],
      },
      { status: 400 }
    );
  }

  let radiusKm = Number(sp.get("radius") ?? 5);
  if (!Number.isFinite(radiusKm)) radiusKm = 5;
  radiusKm = Math.min(30, Math.max(0.5, radiusKm));

  let limit = Number.parseInt(sp.get("limit") ?? "30", 10);
  if (!Number.isFinite(limit)) limit = 30;
  limit = Math.min(MAX_LIMIT, Math.max(1, limit));

  const nowIso = new Date().toISOString();
  const { dLat, dLng } = bboxDeltas(lat, radiusKm * 1.2);

  const [eventsRes, placesRes] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("status", "active")
      .gt("start_time", nowIso)
      .gte("lat", lat - dLat)
      .lte("lat", lat + dLat)
      .gte("lng", lng - dLng)
      .lte("lng", lng + dLng)
      .order("start_time", { ascending: true })
      .limit(MAX_FETCH),
    supabase
      .from("paris_places")
      .select("*")
      .gte("lat", lat - dLat)
      .lte("lat", lat + dLat)
      .gte("lng", lng - dLng)
      .lte("lng", lng + dLng)
      .limit(MAX_FETCH),
  ]);

  if (eventsRes.error) {
    return NextResponse.json(
      { error: eventsRes.error.message, items: [] as NearbyMapItem[], events: [] as Event[], places: [] as Place[] },
      { status: 500 }
    );
  }
  if (placesRes.error) {
    return NextResponse.json(
      { error: placesRes.error.message, items: [] as NearbyMapItem[], events: [] as Event[], places: [] as Place[] },
      { status: 500 }
    );
  }

  const eventsWithDist = ((eventsRes.data ?? []) as Event[])
    .map((event) => ({ ...event, distance_km: haversineKm(lat, lng, event.lat, event.lng) }))
    .filter((event) => (event.distance_km ?? 99) <= radiusKm);

  const placesWithDist = ((placesRes.data ?? []) as Place[])
    .map((place) => ({ ...place, distance_km: haversineKm(lat, lng, place.lat, place.lng) }))
    .filter((place) => (place.distance_km ?? 99) <= radiusKm);

  const eventItems = eventsWithDist.map((event) => ({
    id: event.id,
    type: "event" as const,
    name: event.title,
    category: event.category,
    lat: event.lat,
    lng: event.lng,
    distance_km: event.distance_km ?? 0,
    start_time: event.start_time,
    location_name: event.location_name,
    arrondissement: event.arrondissement,
  }));

  const placeItems = placesWithDist.map((place) => ({
    id: place.id,
    type: "place" as const,
    name: place.name,
    category: place.category,
    lat: place.lat,
    lng: place.lng,
    distance_km: place.distance_km ?? 0,
    location_name: place.address,
    arrondissement: place.arrondissement,
  }));

  const items = [...eventItems, ...placeItems]
    .sort((a, b) => {
      if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
      if (a.type !== b.type) return a.type === "event" ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);

  return NextResponse.json({
    items,
    events: eventsWithDist.slice(0, MAX_LIMIT),
    places: placesWithDist.slice(0, MAX_LIMIT),
    total: items.length,
    radiusKm,
  });
}
