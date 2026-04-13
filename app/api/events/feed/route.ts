/**
 * GET /api/events/feed
 *
 * Personalized, scored event feed.
 *
 * Query params:
 *   lat, lng           – required
 *   radius             – km, default 30, max 30
 *   limit              – default 40, max 50
 *   lang               – "en" | "fr", default "en"
 *
 * The caller does NOT send user_id — we derive identity from the auth cookie
 * in the Supabase server client (secure, no user ID in URL).
 *
 * Pipeline:
 *   1. Check cache (3-min TTL, key = userId + rounded lat/lng)
 *   2. Fetch user profile (interests, vibes, arrondissement) — if authenticated
 *   3. Fetch saved events for user — behavioral signal
 *   4. Build PreferenceProfile
 *   5. Fetch events within radius (max 30km, upcoming only)
 *   6. Score + sort by composite score
 *   7. Return top `limit` events with rank_label + feed_score
 *   8. Cache result
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getPublicSupabase }         from "@/lib/supabase/public";
import { bboxDeltas, haversineKm }   from "@/lib/geo";
import { buildPreferenceProfile }    from "@/lib/feed/preferenceProfile";
import { scoreEvent }                from "@/lib/feed/eventScorer";
import {
  buildFeedCacheKey,
  getCachedFeed,
  setCachedFeed,
} from "@/lib/feed/feedCache";
import type { Event }                from "@/types";

const MAX_FETCH = 500;

export async function GET(req: NextRequest) {
  const sp  = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat and lng are required", events: [] as Event[], isPersonalised: false },
      { status: 400 }
    );
  }

  const radiusKm = Math.min(30, Math.max(1, Number(sp.get("radius") ?? 30) || 30));
  const limit    = Math.min(50, Math.max(1, Number.parseInt(sp.get("limit") ?? "40", 10) || 40));
  const lang   = sp.get("lang") === "fr" ? "fr" : "en";

  // ── 1. Auth (optional — anonymous users get cold-start feed) ─────────────────
  const serverSupabase = await createClient();
  let userId: string | null = null;
  let userInterests: string[] = [];
  let userVibes: string[] = [];
  let userArrondissement: string | null = null;

  if (serverSupabase) {
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (user) {
      userId = user.id;
      const { data: profile } = await serverSupabase
        .from("users")
        .select("interests, vibes, arrondissement")
        .eq("id", userId)
        .single();
      if (profile) {
        userInterests    = profile.interests    ?? [];
        userVibes        = profile.vibes        ?? [];
        userArrondissement = profile.arrondissement ?? null;
      }
    }
  }

  // ── 2. Cache check ────────────────────────────────────────────────────────────
  const cacheKey = buildFeedCacheKey(userId, lat, lng);
  const cached   = getCachedFeed(cacheKey);
  if (cached) {
    return NextResponse.json({
      events: cached.events.slice(0, limit),
      total:  cached.events.length,
      isPersonalised: cached.isPersonalised,
      source: "cache",
    });
  }

  // ── 3. Fetch saved events (behavioral signal) ────────────────────────────────
  type SavedRow = { events: { category: string; vibe_tags: string[] | null; arrondissement: string | null } | null };
  let savedRows: SavedRow[] = [];
  let attendeeRows: SavedRow[] = [];

  if (userId && serverSupabase) {
    const [savedRes, attendeeRes] = await Promise.all([
      serverSupabase
        .from("saved_events")
        .select("events(category, vibe_tags, arrondissement)")
        .eq("user_id", userId)
        .limit(100),
      serverSupabase
        .from("event_attendees")
        .select("events(category, vibe_tags, arrondissement)")
        .eq("user_id", userId)
        .limit(100),
    ]);
    savedRows = (savedRes.data as SavedRow[] | null) ?? [];
    attendeeRows = (attendeeRes.data as SavedRow[] | null) ?? [];
  }

  const savedEventRows = [...savedRows, ...attendeeRows]
    .map((r) => r.events)
    .filter((e): e is NonNullable<typeof e> => e !== null);

  // ── 4. Build preference profile ───────────────────────────────────────────────
  const profile = buildPreferenceProfile(
    savedEventRows,
    userInterests,
    userVibes,
    userArrondissement
  );

  // ── 5. Fetch nearby events ────────────────────────────────────────────────────
  const publicSupabase = getPublicSupabase();
  if (!publicSupabase) {
    return NextResponse.json(
      { error: "Supabase not configured", events: [] as Event[], isPersonalised: false },
      { status: 503 }
    );
  }

  const { dLat, dLng } = bboxDeltas(lat, radiusKm * 1.2);
  const nowIso = new Date().toISOString();

  const { data, error } = await publicSupabase
    .from("events")
    .select("*")
    .eq("status", "active")
    .gt("start_time", nowIso)
    .gte("lat", lat - dLat)
    .lte("lat", lat + dLat)
    .gte("lng", lng - dLng)
    .lte("lng", lng + dLng)
    .limit(MAX_FETCH);

  if (error) {
    return NextResponse.json(
      { error: error.message, events: [] as Event[], isPersonalised: false },
      { status: 500 }
    );
  }

  let candidates = ((data ?? []) as Event[])
    .filter((e) => haversineKm(lat, lng, e.lat, e.lng) <= radiusKm);

  // When user is outside the event area, fall back to all active upcoming events globally.
  if (candidates.length === 0) {
    const { data: globalData } = await publicSupabase
      .from("events")
      .select("*")
      .eq("status", "active")
      .gt("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(MAX_FETCH);
    candidates = (globalData ?? []) as Event[];
  }

  // ── 6. Score + sort ───────────────────────────────────────────────────────────
  const scored = candidates
    .map((e) => scoreEvent(e, { userLat: lat, userLng: lng, profile, lang }))
    .sort((a, b) => b.score - a.score);

  const events = scored.map((s) => s.event);

  // ── 7. Cache + return ─────────────────────────────────────────────────────────
  const isPersonalised = profile.hasBehavior;
  setCachedFeed(cacheKey, events, isPersonalised);

  return NextResponse.json({
    events: events.slice(0, limit),
    total:  events.length,
    isPersonalised,
    source: "fresh",
  });
}
