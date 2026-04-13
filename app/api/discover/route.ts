import { NextRequest, NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { bboxDeltas, haversineKm } from "@/lib/geo";
import { sortFeedPriority } from "@/lib/api/eventSort";
import type { Event, Place } from "@/types";

export const dynamic = "force-dynamic";

const RADIUS_KM = 30;
const MAX_EVENTS = 400;
const MAX_PLACES = 200;

function isWeekendLocal(iso: string): boolean {
  const d = new Date(iso);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function withinNextDays(iso: string, days: number): boolean {
  const t = new Date(iso).getTime();
  const now = Date.now();
  return t >= now && t <= now + days * 24 * 60 * 60 * 1000;
}

export async function GET(req: NextRequest) {
  const supabase = getPublicSupabase();
  if (!supabase) {
    return NextResponse.json(
      {
        error: "Supabase not configured",
        happeningNow: [] as Event[],
        upcoming: [] as Event[],
        thisWeekend: [] as Event[],
        forYou: [] as Event[],
        bestCafes: [] as Place[],
        hiddenGems: [] as Place[],
        nearYou: [] as (Event | Place)[],
      },
      { status: 503 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "Invalid or missing lat/lng" },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const { dLat, dLng } = bboxDeltas(lat, RADIUS_KM * 1.2);

  const [evRes, cafeRes, gemRes] = await Promise.all([
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
      .limit(MAX_EVENTS),
    supabase
      .from("paris_places")
      .select("*")
      .in("category", ["cafe", "boulangerie", "restaurant"])
      .gte("lat", lat - dLat)
      .lte("lat", lat + dLat)
      .gte("lng", lng - dLng)
      .lte("lng", lng + dLng)
      .limit(MAX_PLACES),
    supabase
      .from("paris_places")
      .select("*")
      .eq("is_featured", true)
      .gte("lat", lat - dLat)
      .lte("lat", lat + dLat)
      .gte("lng", lng - dLng)
      .lte("lng", lng + dLng)
      .limit(24),
  ]);

  if (evRes.error) {
    return NextResponse.json({ error: evRes.error.message }, { status: 500 });
  }
  if (cafeRes.error) {
    return NextResponse.json({ error: cafeRes.error.message }, { status: 500 });
  }
  if (gemRes.error) {
    return NextResponse.json({ error: gemRes.error.message }, { status: 500 });
  }

  let rawEvents = (evRes.data ?? []) as Event[];

  // If no events found near the user, fall back to all active UPCOMING events globally.
  // This surfaces user-created events even when the viewer is outside the event's city.
  if (rawEvents.length === 0) {
    const { data: globalEv } = await supabase
      .from("events")
      .select("*")
      .eq("status", "active")
      .gt("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(MAX_EVENTS);
    rawEvents = (globalEv ?? []) as Event[];
  }

  const eventsInRadius = rawEvents
    .map((e) => ({ e, d: haversineKm(lat, lng, e.lat, e.lng) }))
    .map(({ e, d }) => ({ ...e, distance_km: d }));

  const now = Date.now();
  const threeH = now + 3 * 60 * 60 * 1000;

  const happeningNow = eventsInRadius
    .filter((e) => {
      const t = new Date(e.start_time).getTime();
      return t >= now && t <= threeH;
    })
    .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
    .slice(0, 12);

  const happeningIds = new Set(happeningNow.map((e) => e.id));

  /** All upcoming events, soonest first — includes user-created listings anywhere. */
  const upcoming = [...eventsInRadius]
    .filter((e) => {
      const t = new Date(e.start_time).getTime();
      return t >= now && !happeningIds.has(e.id);
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 30);

  const thisWeekend = eventsInRadius
    .filter((e) => isWeekendLocal(e.start_time) && withinNextDays(e.start_time, 14))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 12);

  const forYou = sortFeedPriority(eventsInRadius, lat, lng).slice(0, 20);

  const cafeRows = (cafeRes.data ?? []) as Place[];
  const cafesSorted = cafeRows
    .map((p) => ({ p, d: haversineKm(lat, lng, p.lat, p.lng) }))
    .filter((x) => x.d <= RADIUS_KM)
    .sort((a, b) => a.d - b.d)
    .map(({ p, d }) => ({ ...p, distance_km: d }))
    .slice(0, 12);

  let gemRows = (gemRes.data ?? []) as Place[];
  if (gemRows.length === 0) {
    const { data: fallback } = await supabase
      .from("paris_places")
      .select("*")
      .gte("lat", lat - dLat)
      .lte("lat", lat + dLat)
      .gte("lng", lng - dLng)
      .lte("lng", lng + dLng)
      .limit(40);
    gemRows = (fallback ?? []) as Place[];
  }

  const hiddenGems = gemRows
    .map((p) => ({ p, d: haversineKm(lat, lng, p.lat, p.lng) }))
    .filter((x) => x.d <= RADIUS_KM)
    .sort((a, b) => a.d - b.d)
    .map(({ p, d }) => ({ ...p, distance_km: d }))
    .slice(0, 9);

  const nearestEvents = [...eventsInRadius].sort(
    (a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0)
  );
  const allPlaces = [...cafesSorted, ...hiddenGems];
  const placeById = new Map<string, Place>();
  for (const p of allPlaces) placeById.set(p.id, p);
  const nearestPlaces = Array.from(placeById.values()).sort(
    (a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99)
  );

  const nearYou: (Event | Place)[] = [
    ...nearestEvents.slice(0, 10),
    ...nearestPlaces.slice(0, 6),
  ].slice(0, 16);

  return NextResponse.json({
    happeningNow,
    upcoming,
    thisWeekend,
    forYou,
    bestCafes: cafesSorted,
    hiddenGems,
    nearYou,
  });
}
