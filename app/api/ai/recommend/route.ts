export const maxDuration = 30;

/**
 * POST /api/ai/recommend
 *
 * Location-aware, vibe-based AI recommendations powered by Gemini.
 *
 * Guardrails (applied in order):
 *  1. Per-user rate limit  : 8 req/min (IP or user ID)
 *  2. Global rate limit    : 200 req/min
 *  3. Daily cap            : 15 000 req/day
 *  4. Monthly budget cap   : $50 USD (estimated)
 *  5. In-memory cache      : 10 min, keyed by rounded lat/lng + vibe + time bucket
 *
 * If any guard triggers → fallback: nearby DB rows, sorted by distance.
 *
 * Request  { lat, lng, vibe? }
 * Response { items: RecommendItem[], message: string, source: "ai"|"cache"|"fallback" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { bboxDeltas, haversineKm } from "@/lib/geo";
import { checkRecommendLimit, consumeRecommendQuota } from "@/lib/ai/recommendRateLimit";
import { isBudgetExhausted, recordCall, getCostSnapshot } from "@/lib/ai/costTracker";
import {
  buildCacheKey,
  getTimeBucket,
  getCached,
  setCached,
} from "@/lib/ai/recommendCache";
import type { RecommendItem, Vibe } from "@/lib/ai/recommendTypes";
import type { Event, Place } from "@/types";
import { getGeminiApiKey } from "@/lib/geminiEnv";

export const dynamic = "force-dynamic";

// ─── Config ───────────────────────────────────────────────────────────────────

const NEARBY_RADIUS_KM = 8;
const MAX_CONTEXT_ITEMS = 8;   // items passed to Gemini
const MAX_OUTPUT_TOKENS = 400; // hard Gemini token cap

const VALID_VIBES = new Set(["date", "chill", "nightlife", "explore", "work"]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function rateLimitResponse(reason: string, retryAfterMs: number, lang: "en" | "fr") {
  const mins = Math.ceil(retryAfterMs / 60_000) || 1;
  const msg =
    lang === "fr"
      ? `Trop de demandes — réessayez dans ${mins} min.`
      : `Too many requests — please try again in ${mins} min.`;
  return NextResponse.json(
    { items: [] as RecommendItem[], message: msg, source: "fallback", limitReason: reason },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
        "Cache-Control": "no-store",
      },
    }
  );
}

// ─── DB: fetch nearby candidates ─────────────────────────────────────────────

async function fetchNearbyCandidates(
  lat: number,
  lng: number,
  vibe: string,
  radiusKm: number = NEARBY_RADIUS_KM
): Promise<{ events: Event[]; places: Place[] }> {
  const supabase = getPublicSupabase();
  if (!supabase) return { events: [], places: [] };

  const { dLat, dLng } = bboxDeltas(lat, radiusKm * 1.3);
  const nowIso = new Date().toISOString();

  const [evRes, plRes] = await Promise.all([
    supabase
      .from("events")
      .select("id,title,category,vibe_tags,start_time,location_name,arrondissement,lat,lng,is_free,image_url,attendee_count")
      .eq("status", "active")
      .gt("start_time", nowIso)
      .gte("lat", lat - dLat)
      .lte("lat", lat + dLat)
      .gte("lng", lng - dLng)
      .lte("lng", lng + dLng)
      .limit(40),
    supabase
      .from("paris_places")
      .select("id,name,category,description,arrondissement,tags,lat,lng,image_url,is_featured")
      .gte("lat", lat - dLat)
      .lte("lat", lat + dLat)
      .gte("lng", lng - dLng)
      .lte("lng", lng + dLng)
      .limit(40),
  ]);

  const events = ((evRes.data ?? []) as Event[])
    .map((e) => ({ ...e, distance_km: haversineKm(lat, lng, e.lat, e.lng) }))
    .filter((e) => e.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);

  let places = ((plRes.data ?? []) as Place[])
    .map((p) => ({ ...p, distance_km: haversineKm(lat, lng, p.lat, p.lng) }))
    .filter((p) => p.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);

  // Vibe-aware soft boost
  if (vibe) {
    const vibeBoost = (tags: string[] | null | undefined) =>
      (tags ?? []).some((t) => t.toLowerCase().includes(vibe.toLowerCase()));

    places = [
      ...places.filter((p) => vibeBoost(p.tags)),
      ...places.filter((p) => !vibeBoost(p.tags)),
    ];
  }

  return { events, places };
}

// ─── Build fallback response from DB rows ────────────────────────────────────

function buildFallback(
  events: Event[],
  places: Place[],
  lang: "en" | "fr"
): { items: RecommendItem[]; message: string } {
  // Popularity-aware ranking: closer first, then engagement/featured signal.
  const rankedEvents = [...events].sort((a, b) => {
    const popA = (a.attendee_count ?? 0) * 0.15;
    const popB = (b.attendee_count ?? 0) * 0.15;
    const scoreA = (a.distance_km ?? 99) - popA;
    const scoreB = (b.distance_km ?? 99) - popB;
    return scoreA - scoreB;
  });
  const rankedPlaces = [...places].sort((a, b) => {
    const featA = a.is_featured ? 0.2 : 0;
    const featB = b.is_featured ? 0.2 : 0;
    const scoreA = (a.distance_km ?? 99) - featA;
    const scoreB = (b.distance_km ?? 99) - featB;
    return scoreA - scoreB;
  });

  const items: RecommendItem[] = [
    ...rankedEvents.slice(0, 3).map((e): RecommendItem => ({
      id: e.id,
      title: e.title,
      description: e.location_name ?? e.arrondissement ?? "",
      category: e.category,
      type: "event",
      lat: e.lat,
      lng: e.lng,
      arrondissement: e.arrondissement ?? undefined,
      distance_km: e.distance_km,
      start_time: e.start_time,
      is_free: e.is_free,
      image_url: e.image_url,
    })),
    ...rankedPlaces.slice(0, 3).map((p): RecommendItem => ({
      id: p.id,
      title: p.name,
      description: p.description ?? p.arrondissement ?? "",
      category: p.category,
      type: "place",
      lat: p.lat,
      lng: p.lng,
      arrondissement: p.arrondissement,
      distance_km: p.distance_km,
      image_url: p.image_url,
    })),
  ].slice(0, 5);

  const message =
    lang === "fr"
      ? "Voici les meilleures options près de vous en ce moment."
      : "Here are the best options near you right now.";

  return { items, message };
}

// ─── Gemini call ─────────────────────────────────────────────────────────────

interface GeminiItem {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
}

async function callGemini(prompt: string): Promise<GeminiItem[]> {
  const key = getGeminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.35,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned) as GeminiItem[];
  return Array.isArray(parsed) ? parsed : [];
}

// ─── Build Gemini prompt ─────────────────────────────────────────────────────

function buildPrompt(
  vibe: string,
  lang: "en" | "fr",
  contextItems: { id: string; title: string; category: string; distKm: number; type: string }[]
): string {
  const vibeInstruction =
    vibe
      ? `User vibe: "${vibe}". Prefer spots that match this mood.`
      : "No specific vibe — recommend the most interesting nearby options.";

  const itemList = contextItems
    .map((x) => `${x.id} | ${x.title} | ${x.category} | ${x.distKm.toFixed(1)}km | ${x.type}`)
    .join("\n");

  const langNote =
    lang === "fr"
      ? 'Write "title" and "description" in French.'
      : 'Write "title" and "description" in English.';

  return `You are a city discovery guide. ${vibeInstruction}

Choose 3 to 5 of the best recommendations from the list below. Rank them by fit for the vibe and proximity. ${langNote}

Available options (id | name | category | distance | type):
${itemList}

Return ONLY a JSON array, no markdown:
[{"id":"<same id from list>","title":"<name>","description":"<max 2 lines, specific & evocative>","category":"<category>"}]`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { lat?: number; lng?: number; vibe?: string; lang?: string };
  try {
    body = (await req.json()) as { lat?: number; lng?: number; vibe?: string; lang?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const lang = body.lang === "fr" ? "fr" : ("en" as "en" | "fr");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const rawVibe = (body.vibe ?? "").toLowerCase().trim();
  const vibe: Vibe = VALID_VIBES.has(rawVibe) ? (rawVibe as Vibe) : "";

  // ── 1. Cache lookup ──────────────────────────────────────────────────────
  const bucket = getTimeBucket();
  const cacheKey = buildCacheKey(lat, lng, vibe, bucket);
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({
      items: cached.items,
      message: cached.message,
      source: cached.fromFallback ? "fallback" : "cache",
    });
  }

  // ── 2. Rate limits ───────────────────────────────────────────────────────
  // Prefer authenticated user key; fallback to IP for anonymous sessions.
  let userKey = getIp(req);
  const serverSupabase = await createServerClient();
  if (serverSupabase) {
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
    if (user?.id) userKey = `user:${user.id}`;
  }
  const rl = checkRecommendLimit(userKey);
  if (!rl.allowed) {
    return rateLimitResponse(rl.reason ?? "limit", rl.retryAfterMs, lang);
  }

  // ── 3. Fetch nearby candidates from DB ──────────────────────────────────
  let { events, places } = await fetchNearbyCandidates(lat, lng, vibe);
  // Never return an empty recommendation payload: widen radius once before fallback.
  if (events.length === 0 && places.length === 0) {
    const wide = await fetchNearbyCandidates(lat, lng, vibe, 30);
    events = wide.events;
    places = wide.places;
  }

  // Keep this endpoint location-strict: never inject Paris KB globally.
  if (events.length === 0 && places.length === 0) {
    consumeRecommendQuota(userKey);
    return NextResponse.json({
      items: [] as RecommendItem[],
      message: lang === "fr" ? "Aucune suggestion locale pour l'instant." : "No nearby suggestions right now.",
      source: "fallback",
    });
  }

  // ── 5. Check cost cap → use fallback if exceeded ─────────────────────────
  if (isBudgetExhausted()) {
    const fb = buildFallback(events, places, lang);
    setCached(cacheKey, fb.items, fb.message, true);
    consumeRecommendQuota(userKey);
    return NextResponse.json({ ...fb, source: "fallback" });
  }

  // ── 6. No Gemini key → use fallback gracefully ───────────────────────────
  if (!getGeminiApiKey()) {
    const fb = buildFallback(events, places, lang);
    setCached(cacheKey, fb.items, fb.message, true);
    consumeRecommendQuota(userKey);
    return NextResponse.json({ ...fb, source: "fallback" });
  }

  // ── 7. Build context list (≤ MAX_CONTEXT_ITEMS) ──────────────────────────
  const contextItems: { id: string; title: string; category: string; distKm: number; type: "event" | "place" }[] = [
    ...events.slice(0, Math.ceil(MAX_CONTEXT_ITEMS / 2)).map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      distKm: e.distance_km ?? 0,
      type: "event" as const,
    })),
    ...places.slice(0, Math.floor(MAX_CONTEXT_ITEMS / 2)).map((p) => ({
      id: p.id,
      title: p.name,
      category: p.category,
      distKm: p.distance_km ?? 0,
      type: "place" as const,
    })),
  ].slice(0, MAX_CONTEXT_ITEMS);

  // ── 8. Call Gemini ────────────────────────────────────────────────────────
  let geminiItems: GeminiItem[] = [];
  let geminiOk = false;
  try {
    const prompt = buildPrompt(vibe, lang, contextItems);
    geminiItems = await callGemini(prompt);
    recordCall();
    geminiOk = true;
  } catch {
    // Gemini failed → fall through to DB fallback
  }

  consumeRecommendQuota(userKey);

  // ── 9. If Gemini failed → use DB fallback ────────────────────────────────
  if (!geminiOk || geminiItems.length === 0) {
    const fb = buildFallback(events, places, lang);
    setCached(cacheKey, fb.items, fb.message, true);
    return NextResponse.json({ ...fb, source: "fallback" });
  }

  // ── 10. Hydrate Gemini IDs with full DB rows (or KB rows) ────────────────
  const evMap = new Map(events.map((e) => [e.id, e]));
  const plMap = new Map(places.map((p) => [p.id, p]));
  const items: RecommendItem[] = geminiItems
    .slice(0, 5)
    .map((gi): RecommendItem | null => {
      const id = gi.id ?? "";
      const ev = evMap.get(id);
      if (ev) {
        return {
          id: ev.id,
          title: gi.title ?? ev.title,
          description: gi.description ?? ev.location_name ?? "",
          category: ev.category,
          type: "event",
          lat: ev.lat,
          lng: ev.lng,
          arrondissement: ev.arrondissement ?? undefined,
          distance_km: ev.distance_km,
          start_time: ev.start_time,
          is_free: ev.is_free,
          image_url: ev.image_url,
        };
      }
      const pl = plMap.get(id);
      if (pl) {
        return {
          id: pl.id,
          title: gi.title ?? pl.name,
          description: gi.description ?? pl.description ?? "",
          category: pl.category,
          type: "place",
          lat: pl.lat,
          lng: pl.lng,
          arrondissement: pl.arrondissement,
          distance_km: pl.distance_km,
          image_url: pl.image_url,
        };
      }
      return null;
    })
    .filter(Boolean) as RecommendItem[];

  // If hydration produced nothing, fall back
  if (items.length === 0) {
    const fb = buildFallback(events, places, lang);
    setCached(cacheKey, fb.items, fb.message, true);
    return NextResponse.json({ ...fb, source: "fallback" });
  }

  const message =
    vibe
      ? lang === "fr"
        ? `Voici mes recommandations « ${vibe} » près de vous.`
        : `Here are my "${vibe}" picks near you.`
      : lang === "fr"
      ? "Voici mes meilleures recommandations du moment."
      : "Here are my top picks for you right now.";

  setCached(cacheKey, items, message, false);

  return NextResponse.json({ items, message, source: "ai" });
}

// ─── Debug endpoint (GET) — only in development ───────────────────────────────
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(getCostSnapshot());
}
