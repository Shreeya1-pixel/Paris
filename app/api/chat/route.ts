export const maxDuration = 30;

/**
 * POST /api/chat
 *
 * Tiered response system:
 *
 *  Assistant mode — Gemini AI with user coordinates + live events context
 *    Used by the map chatbot. Gemini answers about the user's real location.
 *    3 turns per session.
 *
 *  Tier 1 — Local Knowledge Base ($0)
 *    Serves 55 curated Paris spots instantly via keyword matching.
 *
 *  Tier 2 — Gemini AI ($$)
 *    Complex/conversational queries.
 *
 *  Rate limiter
 *    Hard limit: 30 total requests / IP / 15 min.
 *    Soft limit:  5 AI calls      / IP / 15 min.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, consumeQuota, rateLimitMessage } from "@/lib/rateLimiter";
import { assistantQuotaStatus, consumeAssistantTurn } from "@/lib/assistantSessionQuota";
import { routeQuery } from "@/lib/chatRouter";
import { searchLocalKB, ALL_SPOTS } from "@/lib/localKnowledgeBase";
import type { LocalSpot } from "@/lib/localKnowledgeBase";
import { getGeminiApiKey } from "@/lib/geminiEnv";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isOffTopic(query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const blocked = [
    "write code", "fix code", "debug ", "programming", "python ", "javascript ",
    "tell me a joke", "funny joke", "make me laugh",
    "calculate ", "solve for ", "math problem",
    "translate this", "how do you say",
    "what is the weather", "stock price", "bitcoin price",
    "who is the president", "what year is",
  ];
  return blocked.some((b) => q.includes(b));
}

// ─── AI provider wrappers ─────────────────────────────────────────────────────

async function callGemini(system: string, user: string): Promise<string> {
  const key = getGeminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.3 },
      }),
    }
  );
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.find((p) => !p.thought && p.text);
  return textPart?.text ?? "{}";
}

async function callGroq(system: string, user: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: 800,
      temperature: 0.3,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "{}";
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? "{}";
}

async function callOpenAI(system: string, user: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: 800,
      temperature: 0.3,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "{}";
}

async function callAI(system: string, user: string): Promise<string> {
  if (getGeminiApiKey())               return callGemini(system, user);
  if (process.env.GROQ_API_KEY)        return callGroq(system, user);
  if (process.env.ANTHROPIC_API_KEY)   return callAnthropic(system, user);
  if (process.env.OPENAI_API_KEY)      return callOpenAI(system, user);
  throw new Error("NO_AI_KEY");
}

// ─── System prompts ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are the AI place guide for Openworld, a global map-based discovery app.
Your ONLY job: help users find places to visit on the map, anywhere in the world.
Never answer coding, math, general trivia, weather, or anything unrelated to discovering places.
The user's GPS coordinates are provided. Use them to give location-aware suggestions.
When a user asks about a place to eat, drink, explore, hang out, or visit, pick the best matching places from the catalogue provided and return their IDs.
If the catalogue has no good matches, still give a helpful message about what's nearby based on the coordinates.
Always return ONLY valid JSON, no markdown, no prose outside JSON.
`.trim();

const ASSISTANT_SYSTEM = `
You are the interactive map assistant for Openworld, a global map-based discovery app.

You always receive the user's current GPS latitude/longitude, a list of nearby live events, and a catalogue of nearby places already loaded in the app.
THIS IS KEY: base EVERY answer on where the user actually is right now.

Your job:
- Determine the user's city and neighbourhood from their GPS coordinates.
- Answer conversationally about food, things to do, events, or attractions NEAR the user's actual coordinates.
- When relevant, select the best matching place IDs from the "Nearby places catalogue" provided — these are real places near the user right now.
- NEVER assume the user is in Paris or any specific city. Always reverse-geocode their lat/lng mentally.
- If coordinates are missing or (0, 0), ask the user to enable location access.

Return ONLY valid JSON (no markdown fences):
{
  "message": "Your reply (2-5 short sentences). Be specific to the user's city and neighbourhood.",
  "placeIds": ["id1", "id2"]
}

Rules for placeIds:
- Only include IDs that appear in the "Nearby places catalogue" provided in the user message.
- Pick 3-6 of the most relevant places for the query when possible. Omit the field if none match.
- Do NOT invent IDs. Only use IDs from the catalogue exactly as given.
`.trim();

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    query?: string;
    lat?: number;
    lng?: number;
    lang?: string;
    mode?: string;
    sessionId?: string;
    discoverContext?: { events?: { id: string; title: string; start_time?: string; source?: string; ticket_url?: string | null }[] };
  };
  const { query, lat, lng, lang: rawLang, mode, sessionId, discoverContext } = body;
  const lang = rawLang === "fr" ? "fr" : "en";
  const assistantMode = mode === "assistant";

  if (!query?.trim()) {
    return NextResponse.json({ error: "No query provided" }, { status: 400 });
  }

  if (isOffTopic(query)) {
    return NextResponse.json({
      events: [],
      places: [],
      message: "I'm here to help you find places on the map. Try: 'what should I eat near me?'",
      tier: "guardrail",
    });
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(ip);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        events: [],
        places: [],
        message: rateLimitMessage(lang, rateLimit.retryAfterMs),
        rateLimited: true,
        manualSearch: true,
        remainingAssistant: 0,
      },
      { status: 429, headers: {
        "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        "X-RateLimit-Reset": String(Date.now() + rateLimit.retryAfterMs),
      }}
    );
  }

  // ── Assistant mode: Gemini with real coordinates, 3 turns / session ─────
  if (assistantMode) {
    const quotaKey = sessionId?.trim() || `ip:${ip}`;
    const aq = assistantQuotaStatus(quotaKey);
    if (!aq.allowed) {
      consumeQuota(ip, false);
      return NextResponse.json({
        events: [],
        places: [],
        message: "You've used your 3 assistant questions for this session. Try manual search or the Discover tab.",
        tier: "assistant_limit",
        manualSearch: true,
        remainingAssistant: 0,
      });
    }

    if (!getGeminiApiKey()) {
      consumeQuota(ip, false);
      return NextResponse.json({
        events: [],
        places: [],
        message: "Add GEMINI_API_KEY on the server for the assistant. Meanwhile, use Discover or manual search.",
        tier: "assistant",
        manualSearch: true,
        remainingAssistant: aq.remaining,
      });
    }

    if (!rateLimit.aiAllowed) {
      consumeQuota(ip, false);
      return NextResponse.json({
        events: [],
        places: [],
        message: rateLimitMessage(lang, rateLimit.retryAfterMs),
        rateLimited: true,
        manualSearch: true,
        remainingAssistant: aq.remaining,
      });
    }

    const hasValidCoords =
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0);
    if (!hasValidCoords) {
      consumeQuota(ip, false);
      return NextResponse.json({
        events: [],
        places: [],
        message: "Enable location access so I can answer for where you are right now.",
        tier: "assistant",
        manualSearch: true,
        remainingAssistant: aq.remaining,
      });
    }

    // ── Fetch nearby places from Supabase to give Gemini real pins to pick ──
    const ASSISTANT_RADIUS_DEG = 0.35; // ~39 km in degrees (broader city coverage)
    type NearbyPlaceRow = {
      id: string; name: string; category: string; description: string | null;
      arrondissement: string | null; address: string | null; tags: string[] | null;
      lat: number; lng: number; image_url: string | null; price_range: string | null;
      website_url: string | null; opening_hours: Record<string, unknown> | null;
      is_featured: boolean; created_at: string;
    };
    let nearbyPlaceRows: NearbyPlaceRow[] = [];
    try {
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supaUrl && supaKey) {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(supaUrl, supaKey);
        const plRes = await sb
          .from("paris_places")
          .select("id,name,category,description,arrondissement,address,tags,lat,lng,image_url,price_range,website_url,opening_hours,is_featured,created_at")
          .gte("lat", lat - ASSISTANT_RADIUS_DEG)
          .lte("lat", lat + ASSISTANT_RADIUS_DEG)
          .gte("lng", lng - ASSISTANT_RADIUS_DEG)
          .lte("lng", lng + ASSISTANT_RADIUS_DEG)
          .limit(30);
        nearbyPlaceRows = (plRes.data ?? []) as NearbyPlaceRow[];
      }
    } catch { /* continue without places */ }

    const nearbyPlacesCtx = nearbyPlaceRows.map((p) => ({
      id: p.id, name: p.name, category: p.category,
      arrondissement: p.arrondissement,
      description: (p.description ?? "").slice(0, 60),
    }));

    // Build the context: coordinates + events + nearby places catalogue
    const discoverEvents = discoverContext?.events ?? [];
    const userMessage = [
      `User question: "${query}"`,
      ``,
      `Current User Location: latitude ${lat}, longitude ${lng}`,
      `Language preference: ${lang}`,
      ``,
      `Nearby live events (Ticketmaster + app listings):`,
      JSON.stringify(discoverEvents.slice(0, 20)),
      ``,
      `Nearby places catalogue (use ONLY these IDs in placeIds):`,
      JSON.stringify(nearbyPlacesCtx),
      ``,
      `IMPORTANT: Use the coordinates above to determine which city/neighbourhood the user is in.`,
      `Answer their question specifically for THAT location. Do NOT default to Paris.`,
      `Pick placeIds only from the catalogue above that best answer the user's question.`,
      `If the catalogue is empty, do not invent places and say nearby place data is limited right now.`,
    ].join("\n");

    console.log("[chat/assistant] lat:", lat, "lng:", lng, "query:", query?.slice(0, 60), "places_ctx:", nearbyPlacesCtx.length);

    let raw = "{}";
    try {
      raw = await callGemini(ASSISTANT_SYSTEM, userMessage);
      consumeQuota(ip, true);
      consumeAssistantTurn(quotaKey);
    } catch (err) {
      console.error("[chat/assistant] Gemini error:", err);
      consumeQuota(ip, false);
      return NextResponse.json({
        events: [],
        places: [],
        message: "Assistant is unavailable. Open Discover or try a manual search.",
        tier: "assistant",
        manualSearch: true,
        remainingAssistant: assistantQuotaStatus(quotaKey).remaining,
      });
    }

    console.log("[chat/assistant] raw response:", raw.slice(0, 400));

    const cleaned = raw
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let msgText = "Here's what I found near you.";
    let pickedPlaceIds: string[] = [];
    try {
      const parsed = JSON.parse(cleaned) as { message?: string; placeIds?: string[] };
      msgText = parsed.message || cleaned.slice(0, 500);
      pickedPlaceIds = Array.isArray(parsed.placeIds) ? parsed.placeIds.slice(0, 6) : [];
    } catch {
      msgText = cleaned.slice(0, 500) || "Here's what I found near you.";
    }

    // Ensure users get strong local suggestions: if Gemini returned <3 IDs but we
    // have local catalogue rows, backfill with nearest places.
    if (pickedPlaceIds.length < 3 && nearbyPlaceRows.length > 0) {
      const nearestFallbackIds = [...nearbyPlaceRows]
        .sort((a, b) => {
          const da = (a.lat - lat) * (a.lat - lat) + (a.lng - lng) * (a.lng - lng);
          const db = (b.lat - lat) * (b.lat - lat) + (b.lng - lng) * (b.lng - lng);
          return da - db;
        })
        .slice(0, 6)
        .map((p) => p.id);
      const merged = [...pickedPlaceIds, ...nearestFallbackIds];
      pickedPlaceIds = [...new Set(merged)].slice(0, 6);
    }

    // ── Hydrate picked place IDs into full place objects ─────────────────────
    const placeById = new Map(nearbyPlaceRows.map((p) => [p.id, p]));
    const hydratedPlaces = pickedPlaceIds
      .map((id) => placeById.get(id))
      .filter(Boolean)
      .map((p) => ({
        id: p!.id,
        name: p!.name,
        category: p!.category,
        description: p!.description,
        address: p!.address ?? p!.arrondissement ?? "",
        arrondissement: p!.arrondissement,
        lat: p!.lat,
        lng: p!.lng,
        image_url: p!.image_url,
        tags: p!.tags ?? [],
        opening_hours: p!.opening_hours ?? null,
        price_range: p!.price_range,
        website_url: p!.website_url,
        instagram_url: null,
        is_featured: p!.is_featured,
        created_at: p!.created_at,
        is_saved: false,
      }));

    const remainingAssistant = assistantQuotaStatus(quotaKey).remaining;
    return NextResponse.json({
      events: [],
      places: hydratedPlaces,
      message: msgText,
      tier: "assistant",
      remainingAssistant,
    });
  }

  // ── Tier 1: Local KB ─────────────────────────────────────────────────────
  const forceLocal = !rateLimit.aiAllowed;
  const route = routeQuery(query, lang, false);

  if (route.tier === "local") {
    consumeQuota(ip, false);
    return NextResponse.json({
      events: [], places: route.spots.map(localSpotToPlace),
      message: route.message, tier: "local",
    });
  }

  if (forceLocal) {
    const { spots, message } = searchLocalKB(query, lang);
    consumeQuota(ip, false);
    if (spots.length > 0) {
      return NextResponse.json({ events: [], places: spots.map(localSpotToPlace), message, tier: "local" });
    }
    return NextResponse.json({
      events: [], places: [],
      message: rateLimitMessage(lang, rateLimit.retryAfterMs),
      rateLimited: true, tier: "local",
    });
  }

  // ── Tier 2: Gemini AI ─────────────────────────────────────────────────────

  let dbPlaces: Record<string, unknown>[] = [];
  try {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const akey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && akey) {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(url, akey);
      const plRes = await sb
        .from("paris_places")
        .select("id, name, category, description, arrondissement, tags, price_range, lat, lng")
        .limit(60);
      dbPlaces = (plRes.data ?? []) as Record<string, unknown>[];
    }
  } catch { /* continue with KB only */ }

  const kbContext = ALL_SPOTS.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    arrondissement: s.arrondissement,
    tags: s.tags.slice(0, 5),
    description: s.description.slice(0, 80),
  }));

  const dbContext = dbPlaces.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    arrondissement: p.arrondissement,
    tags: p.tags,
    description: ((p.description as string) ?? "").slice(0, 80),
  }));

  const dbNames = new Set(dbContext.map((p) => String(p.name).toLowerCase()));
  const mergedKB = kbContext.filter((k) => !dbNames.has(k.name.toLowerCase()));
  const allPlacesCtx = [...dbContext, ...mergedKB];

  const userMessage = `User query: "${query}"
User location: lat ${lat ?? "unknown"}, lng ${lng ?? "unknown"}
Language: ${lang}

Available places catalogue (${allPlacesCtx.length} spots):
${JSON.stringify(allPlacesCtx)}

Instructions:
- Pick the 1-5 most relevant place IDs from the catalogue above that match the query.
- ONLY use IDs that appear in the catalogue.
- Return ONLY valid JSON, no markdown:
{
  "placeIds": ["id1", "id2"],
  "message": "One short warm sentence (max 20 words)."
}`;

  let raw = "{}";
  try {
    raw = await callAI(SYSTEM_PROMPT, userMessage);
    consumeQuota(ip, true);
  } catch (err: unknown) {
    const noKey = err instanceof Error && err.message === "NO_AI_KEY";
    consumeQuota(ip, false);
    const { spots, message } = searchLocalKB(query, lang);
    if (spots.length > 0) {
      return NextResponse.json({ events: [], places: spots.map(localSpotToPlace), message, tier: "local" });
    }
    return NextResponse.json({
      events: [], places: [],
      message: noKey
        ? "Add GEMINI_API_KEY to .env.local to enable AI search."
        : "AI search is temporarily unavailable.",
      tier: "ai",
    });
  }

  const cleaned = raw
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

  let parsed: { placeIds?: string[]; message?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const { spots, message } = searchLocalKB(query, lang);
    return NextResponse.json({
      events: [],
      places: spots.length > 0 ? spots.map(localSpotToPlace) : [],
      message: spots.length > 0 ? message : "Here are some ideas!",
      tier: "local",
    });
  }

  const pickedIds = parsed.placeIds ?? [];

  if (pickedIds.length === 0) {
    const { spots, message } = searchLocalKB(query, lang);
    return NextResponse.json({
      events: [],
      places: spots.map(localSpotToPlace),
      message: spots.length > 0 ? message : (parsed.message ?? "Nothing found - try rephrasing!"),
      tier: spots.length > 0 ? "local" : "ai",
    });
  }

  // ── Hydrate: UUID IDs -> Supabase, kb-paris-* IDs -> local KB ─────────────
  const uuids = pickedIds.filter((id) => !id.startsWith("kb-"));
  const kbIds  = pickedIds.filter((id) => id.startsWith("kb-"));

  let supabasePlaces: unknown[] = [];
  if (uuids.length > 0) {
    try {
      const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const akey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && akey) {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(url, akey);
        const plRes = await sb.from("paris_places").select("*").in("id", uuids);
        supabasePlaces = plRes.data ?? [];
      }
    } catch { /* ignore */ }
  }

  const kbPlaces = ALL_SPOTS.filter((s) => kbIds.includes(s.id)).map(localSpotToPlace);

  const hydratedById = new Map<string, unknown>();
  for (const p of supabasePlaces) hydratedById.set((p as { id: string }).id, p);
  for (const p of kbPlaces)       hydratedById.set(p.id, p);

  const orderedPlaces = pickedIds
    .map((id) => hydratedById.get(id))
    .filter(Boolean);

  if (orderedPlaces.length === 0) {
    const { spots, message } = searchLocalKB(query, lang);
    return NextResponse.json({
      events: [],
      places: spots.map(localSpotToPlace),
      message: spots.length > 0 ? message : (parsed.message ?? "Here's what I found!"),
      tier: "local",
    });
  }

  return NextResponse.json({
    events: [],
    places: orderedPlaces,
    message: parsed.message ?? "Here's what I found!",
    tier: "ai",
  });
}

// ─── Shape adapters ───────────────────────────────────────────────────────────

function localSpotToPlace(spot: LocalSpot) {
  return {
    id: spot.id,
    name: spot.name,
    category: spot.category,
    description: spot.description,
    address: spot.address,
    arrondissement: spot.arrondissement,
    lat: spot.lat,
    lng: spot.lng,
    image_url: null,
    tags: spot.tags,
    opening_hours: spot.opening_hours ?? {},
    price_range: spot.price_range,
    website_url: spot.website_url,
    instagram_url: null,
    is_featured: spot.is_featured,
    created_at: spot.created_at,
  };
}
