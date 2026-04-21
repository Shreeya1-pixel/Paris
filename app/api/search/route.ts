import { NextRequest, NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { haversineKm } from "@/lib/geo";
import { fetchMergedNearbyForLocation } from "@/lib/places/fetchMergedNearbyForLocation";
import { mapEventCategoriesToPlaceCategories } from "@/lib/search/eventToPlaceCategories";
import type { Event, Place } from "@/types";

export const dynamic = "force-dynamic";

function sanitizeIlike(q: string): string {
  return q.replace(/[%_]/g, "").trim();
}

function rankScore(
  title: string,
  name: string | undefined,
  qLower: string
): number {
  const t = (title ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();
  const hay = `${t} ${n}`;
  if (!qLower) return 2;
  if (t === qLower || n === qLower) return 0;
  if (t.startsWith(qLower) || n.startsWith(qLower)) return 1;
  if (hay.includes(qLower)) return 2;
  return 3;
}

export async function GET(req: NextRequest) {
  const supabase = getPublicSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured", events: [] as Event[], places: [] as Place[] },
      { status: 503 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const rawQ = sp.get("q") ?? "";
  const q = sanitizeIlike(rawQ);
  const singleCategory = sp.get("category")?.trim() || "";
  const categoriesParam = sp.get("categories")?.trim() || "";
  const categories = Array.from(
    new Set([
      ...categoriesParam
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      ...(singleCategory ? [singleCategory] : []),
    ])
  );
  const arrondissement = sp.get("arrondissement")?.trim() || "";
  const dateFrom = sp.get("date_from")?.trim() || "";
  const dateTo = sp.get("date_to")?.trim() || "";
  const freeOnly =
    sp.get("free_only") === "1" ||
    sp.get("free_only") === "true";
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const hasUser = Number.isFinite(lat) && Number.isFinite(lng);

  let limit = Number.parseInt(sp.get("limit") ?? "40", 10);
  if (!Number.isFinite(limit)) limit = 40;
  limit = Math.min(50, Math.max(1, limit));

  const hasFilter =
    q.length > 0 ||
    categories.length > 0 ||
    !!arrondissement ||
    !!dateFrom ||
    !!dateTo ||
    freeOnly;

  if (!hasFilter) {
    return NextResponse.json({ events: [] as Event[], places: [] as Place[] });
  }

  const nowIso = new Date().toISOString();
  const qLower = q.toLowerCase();

  let evQuery = supabase.from("events").select("*").eq("status", "active").gt("start_time", nowIso);

  if (q) {
    const pattern = `%${q}%`;
    evQuery = evQuery.or(`title.ilike.${pattern},location_name.ilike.${pattern}`);
  }
  if (categories.length === 1) evQuery = evQuery.eq("category", categories[0]);
  if (categories.length > 1) evQuery = evQuery.in("category", categories);
  if (arrondissement) evQuery = evQuery.eq("arrondissement", arrondissement);
  if (dateFrom) evQuery = evQuery.gte("start_time", new Date(dateFrom).toISOString());
  if (dateTo) evQuery = evQuery.lte("start_time", new Date(dateTo).toISOString());
  if (freeOnly) evQuery = evQuery.eq("is_free", true);

  const placeCategories =
    categories.length > 0 ? mapEventCategoriesToPlaceCategories(categories) : undefined;

  /** e.g. only "pop-up" — no mapped PlaceCategory; avoid returning unfiltered API places */
  const skipPlacesEntirely =
    categories.length > 0 && placeCategories === null && !q && !arrondissement;

  const shouldQueryPlaces =
    !skipPlacesEntirely &&
    (q.length > 0 ||
      !!arrondissement ||
      (placeCategories !== undefined && placeCategories !== null));

  const evRes = await evQuery.limit(200);

  let places: Place[] = [];
  if (shouldQueryPlaces && hasUser) {
    const merged = await fetchMergedNearbyForLocation(lat, lng, { resultLimit: 100 });
    let filtered = merged;
    if (q) {
      filtered = merged.filter((p) => {
        const hay = `${p.name} ${p.description ?? ""} ${p.address}`.toLowerCase();
        return hay.includes(qLower);
      });
    }
    if (placeCategories && placeCategories.length >= 1) {
      filtered = filtered.filter((p) => placeCategories!.includes(p.category));
    }
    if (arrondissement) {
      const a = arrondissement.toLowerCase();
      filtered = filtered.filter((p) => (p.arrondissement ?? "").toLowerCase().includes(a));
    }
    places = filtered;
  }

  if (evRes.error) {
    return NextResponse.json({ error: evRes.error.message, events: [], places: [] }, { status: 500 });
  }

  const events = (evRes.data ?? []) as Event[];

  const scoredEvents = events.map((e) => {
    const textRank = rankScore(e.title, e.location_name ?? undefined, qLower);
    const dist = hasUser ? haversineKm(lat, lng, e.lat, e.lng) : 0;
    return { e, textRank, dist };
  });

  scoredEvents.sort((a, b) => {
    if (a.textRank !== b.textRank) return a.textRank - b.textRank;
    if (hasUser && a.dist !== b.dist) return a.dist - b.dist;
    return new Date(a.e.start_time).getTime() - new Date(b.e.start_time).getTime();
  });

  const scoredPlaces = places.map((p) => {
    const textRank = rankScore(p.name, undefined, qLower);
    const dist = hasUser ? haversineKm(lat, lng, p.lat, p.lng) : 0;
    return { p, textRank, dist };
  });

  scoredPlaces.sort((a, b) => {
    if (a.textRank !== b.textRank) return a.textRank - b.textRank;
    if (hasUser) return a.dist - b.dist;
    return a.p.name.localeCompare(b.p.name);
  });

  const outEvents = scoredEvents.slice(0, limit).map(({ e, dist }) =>
    hasUser ? { ...e, distance_km: dist } : e
  );
  const placeLimit = Math.max(0, limit - outEvents.length);
  const outPlaces = scoredPlaces.slice(0, placeLimit || limit).map(({ p, dist }) =>
    hasUser ? { ...p, distance_km: dist } : p
  );

  return NextResponse.json({
    events: outEvents,
    places: outPlaces,
  });
}
