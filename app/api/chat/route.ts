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

type AssistantPlaceRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  arrondissement: string | null;
  address: string | null;
  tags: string[] | null;
  lat: number;
  lng: number;
  image_url: string | null;
  price_range: string | null;
  website_url: string | null;
  opening_hours: Record<string, unknown> | null;
  is_featured: boolean;
  created_at: string;
};

function dedupePlaces(rows: AssistantPlaceRow[]): AssistantPlaceRow[] {
  const byKey = new Map<string, AssistantPlaceRow>();
  for (const p of rows) {
    const key = `${p.name.toLowerCase().trim()}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`;
    if (!byKey.has(key)) byKey.set(key, p);
  }
  return Array.from(byKey.values());
}

function rankAssistantPlacesForQuery(rows: AssistantPlaceRow[], query: string): AssistantPlaceRow[] {
  const q = query.toLowerCase();
  const has = (arr: string[]) => arr.some((x) => q.includes(x));

  const intent =
    has(["date", "romantic"]) ? "date" :
    has(["night", "nightlife", "party", "club", "music", "bar"]) ? "nightlife" :
    has(["chill", "relax", "calm", "work", "study"]) ? "chill" :
    has(["eat", "food", "dinner", "lunch", "breakfast", "brunch"]) ? "food" :
    has(["shop", "market", "unique", "fun", "explore", "bored"]) ? "explore" :
    "general";

  const score = (p: AssistantPlaceRow): number => {
    const cat = p.category.toLowerCase();
    const text = `${p.name} ${p.description ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase();
    let s = 0;
    if (intent === "date") {
      if (cat.includes("restaurant") || cat.includes("bar") || cat.includes("cafe")) s += 4;
      if (cat.includes("park") || cat.includes("gallery")) s += 2;
      if (text.includes("romantic")) s += 2;
    } else if (intent === "nightlife") {
      if (cat.includes("bar") || cat.includes("club")) s += 5;
      if (text.includes("live") || text.includes("music")) s += 2;
    } else if (intent === "chill") {
      if (cat.includes("cafe") || cat.includes("park") || cat.includes("library") || cat.includes("book")) s += 5;
    } else if (intent === "food") {
      if (cat.includes("restaurant") || cat.includes("cafe") || cat.includes("boulangerie") || cat.includes("market")) s += 5;
    } else if (intent === "explore") {
      if (cat.includes("market") || cat.includes("gallery") || cat.includes("park") || cat.includes("book")) s += 4;
      if (text.includes("unique") || text.includes("hidden")) s += 2;
    } else {
      s += 1;
    }
    return s;
  };

  return [...rows].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sb - sa;
    const da = a.lat * a.lat + a.lng * a.lng;
    const db = b.lat * b.lat + b.lng * b.lng;
    return da - db;
  });
}

type AssistantIntent = "date" | "nightlife" | "chill" | "food" | "explore" | "general";

function detectAssistantIntent(query: string): AssistantIntent {
  const q = query.toLowerCase();
  const has = (arr: string[]) => arr.some((x) => q.includes(x));
  if (has(["date", "romantic"])) return "date";
  if (has(["night", "nightlife", "party", "club", "music", "bar"])) return "nightlife";
  if (has(["chill", "relax", "calm", "work", "study", "cafe", "café", "coffee", "tea"])) return "chill";
  if (has(["eat", "food", "dinner", "lunch", "breakfast", "brunch", "restaurant", "biryani", "pizza", "burger", "sushi"])) return "food";
  if (has(["shop", "market", "unique", "fun", "explore", "bored"])) return "explore";
  return "general";
}

function intentMatchScore(place: AssistantPlaceRow, intent: AssistantIntent): number {
  const cat = place.category.toLowerCase();
  const text = `${place.name} ${place.description ?? ""} ${(place.tags ?? []).join(" ")}`.toLowerCase();
  if (intent === "date") {
    if (cat.includes("restaurant") || cat.includes("bar") || cat.includes("cafe")) return 3;
    if (cat.includes("park") || cat.includes("gallery")) return 2;
    if (text.includes("romantic")) return 2;
    return 0;
  }
  if (intent === "nightlife") {
    if (cat.includes("bar") || cat.includes("club") || text.includes("nightlife")) return 3;
    if (text.includes("live") || text.includes("music")) return 2;
    return 0;
  }
  if (intent === "chill") {
    if (cat.includes("cafe") || cat.includes("park") || cat.includes("library") || cat.includes("book")) return 3;
    return 0;
  }
  if (intent === "food") {
    if (cat.includes("restaurant") || cat.includes("cafe") || cat.includes("boulangerie") || cat.includes("market")) return 3;
    return 0;
  }
  if (intent === "explore") {
    if (cat.includes("market") || cat.includes("gallery") || cat.includes("park") || cat.includes("book")) return 3;
    if (text.includes("unique") || text.includes("hidden")) return 2;
    return 0;
  }
  return 1;
}

async function fetchAssistantPlacesSupabase(lat: number, lng: number): Promise<AssistantPlaceRow[]> {
  const ASSISTANT_RADIUS_DEG = 0.35; // ~39km
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return [];
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(supaUrl, supaKey);
    const plRes = await sb
      .from("paris_places")
      .select("id,name,category,description,arrondissement,address,tags,lat,lng,image_url,price_range,website_url,opening_hours,is_featured,created_at")
      .gte("lat", lat - ASSISTANT_RADIUS_DEG)
      .lte("lat", lat + ASSISTANT_RADIUS_DEG)
      .gte("lng", lng - ASSISTANT_RADIUS_DEG)
      .lte("lng", lng + ASSISTANT_RADIUS_DEG)
      .limit(50);
    return (plRes.data ?? []) as AssistantPlaceRow[];
  } catch {
    return [];
  }
}

const FSQ_INTENT_CATS: Record<AssistantIntent, string[]> = {
  chill:     ["13030","13032","13033","16032","16000","12002"],          // cafes, parks, museums
  food:      ["13065","13029","13030","13032","13033","17045"],          // restaurants, cafes, markets
  nightlife: ["13003","13058","13059","10024","10032"],                  // bars, clubs, lounges
  date:      ["13032","13065","13003","12000","16032"],                  // cafe, restaurant, bar, gallery, park
  explore:   ["12000","12002","16000","16019","17045","13030"],          // museums, parks, markets, cafes
  general:   ["13030","13032","13065","13003","16032","12000","17045"], // broad mix
};

async function fetchAssistantPlacesFoursquare(lat: number, lng: number, intent: AssistantIntent): Promise<AssistantPlaceRow[]> {
  const key = process.env.FOURSQUARE_API_KEY?.trim();
  if (!key) return [];
  try {
    const url = new URL("https://api.foursquare.com/v3/places/search");
    url.searchParams.set("ll", `${lat},${lng}`);
    url.searchParams.set("radius", "12000");
    url.searchParams.set("limit", "30");
    url.searchParams.set("categories", FSQ_INTENT_CATS[intent].join(","));
    url.searchParams.set("fields", "fsq_id,name,categories,geocodes,location");
    const res = await fetch(url.toString(), {
      headers: { Authorization: key, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: {
        fsq_id?: string;
        name?: string;
        categories?: { name?: string }[];
        geocodes?: { main?: { latitude?: number; longitude?: number } };
        location?: {
          formatted_address?: string;
          locality?: string;
          neighborhood?: string[];
          admin_region?: string;
        };
      }[];
    };
    return (data.results ?? []).flatMap((r): AssistantPlaceRow[] => {
      const pLat = Number(r.geocodes?.main?.latitude);
      const pLng = Number(r.geocodes?.main?.longitude);
      if (!Number.isFinite(pLat) || !Number.isFinite(pLng) || !r.name) return [];
      const category = (r.categories?.[0]?.name ?? "place").toLowerCase();
      return [{
        id: `fsq:${r.fsq_id ?? `${pLat}:${pLng}:${r.name}`}`,
        name: r.name,
        category,
        description: null,
        arrondissement: r.location?.neighborhood?.[0] ?? r.location?.locality ?? r.location?.admin_region ?? null,
        address: r.location?.formatted_address ?? null,
        tags: (r.categories ?? []).map((c) => (c.name ?? "").toLowerCase()).filter(Boolean),
        lat: pLat,
        lng: pLng,
        image_url: null,
        price_range: null,
        website_url: null,
        opening_hours: null,
        is_featured: false,
        created_at: new Date().toISOString(),
      }];
    });
  } catch {
    return [];
  }
}

const GEOAPIFY_INTENT_CATS: Record<AssistantIntent, string[]> = {
  date: ["catering.restaurant", "catering.bar", "catering.cafe", "leisure.park"],
  nightlife: ["catering.bar", "catering.pub", "entertainment", "catering.restaurant"],
  chill: ["catering.cafe", "leisure.park", "education.library", "commercial.books"],
  food: ["catering.restaurant", "catering.cafe", "catering", "commercial.marketplace"],
  explore: ["commercial.marketplace", "entertainment", "leisure.park", "commercial.books"],
  general: ["catering", "entertainment", "leisure.park", "commercial.marketplace"],
};

async function fetchAssistantPlacesGeoapify(lat: number, lng: number, intent: AssistantIntent): Promise<AssistantPlaceRow[]> {
  const key = process.env.GEOAPIFY_API_KEY?.trim();
  if (!key) return [];
  try {
    const url = new URL("https://api.geoapify.com/v2/places");
    url.searchParams.set("categories", GEOAPIFY_INTENT_CATS[intent].join(","));
    url.searchParams.set("filter", `circle:${lng},${lat},12000`);
    url.searchParams.set("bias", `proximity:${lng},${lat}`);
    url.searchParams.set("limit", "30");
    url.searchParams.set("apiKey", key);
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: { properties?: { place_id?: string; name?: string; formatted?: string; lat?: number; lon?: number; categories?: string[]; city?: string; suburb?: string } }[];
    };
    return (data.features ?? []).flatMap((f): AssistantPlaceRow[] => {
      const p = f.properties;
      const pLat = Number(p?.lat);
      const pLng = Number(p?.lon);
      if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) return [];
      const name = p?.name?.trim() || p?.formatted?.split(",")[0]?.trim() || null;
      if (!name) return [];
      const n = name.toLowerCase();
      if (n.includes("colony") || n.includes("tehsil") || n.includes("hospital")) return [];
      return [{
        id: `geo:${p?.place_id ?? `${pLat}:${pLng}:${name}`}`,
        name,
        category: (p?.categories?.[0] ?? "place").toLowerCase(),
        description: null,
        arrondissement: p?.suburb ?? p?.city ?? null,
        address: p?.formatted ?? null,
        tags: p?.categories ?? [],
        lat: pLat,
        lng: pLng,
        image_url: null,
        price_range: null,
        website_url: null,
        opening_hours: null,
        is_featured: false,
        created_at: new Date().toISOString(),
      }];
    });
  } catch {
    return [];
  }
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
        generationConfig: { maxOutputTokens: 800, temperature: 0.9 },
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

You receive the user's GPS coordinates. Base EVERY answer on where the user actually is.

Your job:
- Determine the user's city and neighbourhood from their GPS coordinates.
- Answer conversationally about food, things to do, events, or attractions NEAR the user.
- NEVER assume the user is in Paris or any specific city.
- If coordinates are missing or (0, 0), ask the user to enable location access.

You operate in TWO modes depending on whether a places catalogue is provided:

MODE A (catalogue provided):
Return JSON: { "message": "...", "placeIds": ["id1","id2","id3"] }
- Only use IDs from the catalogue. Pick 3-6 best matches.

MODE B (catalogue is empty or has <3 relevant matches):
Use YOUR OWN knowledge to suggest 3-5 REAL, SPECIFIC places that exist at the user's location.
Return JSON:
{
  "message": "Your reply (2-4 sentences). Be specific to the neighbourhood.",
  "suggestedPlaces": [
    { "name": "Exact Place Name", "category": "cafe", "lat": 28.xxx, "lng": 77.xxx, "description": "Short description (15 words max)" }
  ]
}
- Places MUST be real and currently operating. Use accurate coordinates.
- Categories: cafe, restaurant, bar, park, museum, market, gallery, club, bookshop, landmark, temple, monument.

CRITICAL RULES:
- Give DIFFERENT suggestions every time. Never repeat previous answers.
- Be specific to the user's exact neighbourhood, not just the city.
- Match the user's intent precisely (cafe = only cafes, nightlife = only bars/clubs).
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
        message: "You've used all your assistant questions for this session. Try manual search or the Discover tab.",
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

    // ── Fetch nearby places from multiple providers for robust local suggestions ──
    const intent = detectAssistantIntent(query);
    const [supabasePlaces, foursquarePlaces, geoapifyPlaces] = await Promise.all([
      fetchAssistantPlacesSupabase(lat, lng),
      fetchAssistantPlacesFoursquare(lat, lng, intent),
      fetchAssistantPlacesGeoapify(lat, lng, intent),
    ]);
    const nearbyPlaceRows = rankAssistantPlacesForQuery(
      dedupePlaces([...supabasePlaces, ...foursquarePlaces, ...geoapifyPlaces]),
      query
    ).slice(0, 60);
    const intentRows = nearbyPlaceRows
      .filter((p) => intentMatchScore(p, intent) > 0)
      .sort((a, b) => intentMatchScore(b, intent) - intentMatchScore(a, intent));
    const promptRows = (intentRows.length >= 6 ? intentRows : nearbyPlaceRows).slice(0, 40);

    // Shuffle the catalogue order sent to Gemini so it doesn't always pick the first N
    for (let i = promptRows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [promptRows[i], promptRows[j]] = [promptRows[j], promptRows[i]];
    }

    const nearbyPlacesCtx = promptRows.map((p) => ({
      id: p.id, name: p.name, category: p.category,
      arrondissement: p.arrondissement,
      description: (p.description ?? "").slice(0, 60),
    }));


    // Build the context: coordinates + events + nearby places catalogue
    const discoverEvents = discoverContext?.events ?? [];
    // Only use catalogue if we have enough intent-matching entries
    const hasCatalogue = intentRows.length >= 3;
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMessage = [
      `User question: "${query}"`,
      `Request ID: ${nonce}`,
      ``,
      `Current User Location: latitude ${lat}, longitude ${lng}`,
      `Language preference: ${lang}`,
      `Intent detected: ${intent}`,
      ``,
      ...(discoverEvents.length > 0 ? [
        `Nearby live events:`,
        JSON.stringify(discoverEvents.slice(0, 10)),
        ``,
      ] : []),
      ...(hasCatalogue ? [
        `MODE A — Catalogue available (${nearbyPlacesCtx.length} places). Use placeIds from this list:`,
        JSON.stringify(nearbyPlacesCtx),
      ] : [
        `MODE B — No catalogue. You MUST use "suggestedPlaces" (NOT "placeIds") in your JSON response.`,
        `Use YOUR OWN knowledge to suggest 3-5 REAL, currently operating places near (${lat}, ${lng}).`,
        `Each item MUST have: name, category, lat, lng, description.`,
        `Example: { "message": "...", "suggestedPlaces": [{"name":"Cafe XYZ","category":"cafe","lat":${lat.toFixed(3)},"lng":${lng.toFixed(3)},"description":"Cozy cafe with great filter coffee"}] }`,
      ]),
      ``,
      `RULES:`,
      `- Determine the user's city/neighbourhood from coordinates. Do NOT default to Paris.`,
      `- Match the intent "${intent}" precisely. Only suggest places that fit.`,
      `- Give DIFFERENT answers each time (this is request ${nonce}).`,
      `- Be specific: use real place names, not generic descriptions.`,
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

    // Extract JSON from Gemini's response — it sometimes wraps in markdown or adds preamble
    let cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];

    let msgText = "Here's what I found near you.";
    let pickedPlaceIds: string[] = [];
    type GeminiSuggestedPlace = { name: string; category: string; lat: number; lng: number; description?: string };
    let geminiSuggestedPlaces: GeminiSuggestedPlace[] = [];

    try {
      const parsed = JSON.parse(cleaned) as {
        message?: string;
        placeIds?: string[];
        suggestedPlaces?: GeminiSuggestedPlace[];
      };
      msgText = parsed.message || cleaned.slice(0, 500);
      pickedPlaceIds = Array.isArray(parsed.placeIds) ? parsed.placeIds.slice(0, 6) : [];
      geminiSuggestedPlaces = Array.isArray(parsed.suggestedPlaces) ? parsed.suggestedPlaces.slice(0, 6) : [];
    } catch {
      msgText = cleaned.slice(0, 500) || "Here's what I found near you.";
    }

    // ── Hydrate results ─────────────────────────────────────────────────────
    let hydratedPlaces: Record<string, unknown>[] = [];

    if (pickedPlaceIds.length > 0 && nearbyPlaceRows.length > 0) {
      // Mode A: catalogue-based
      const placeById = new Map(nearbyPlaceRows.map((p) => [p.id, p]));
      // Backfill if Gemini picked too few
      if (pickedPlaceIds.length < 3) {
        const fallbackBase = intentRows.length >= 3 ? intentRows : nearbyPlaceRows;
        const candidates = rankAssistantPlacesForQuery(fallbackBase, query)
          .slice(0, 15)
          .map((p) => p.id);
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        pickedPlaceIds = Array.from(new Set(pickedPlaceIds.concat(candidates))).slice(0, 6);
      }
      hydratedPlaces = pickedPlaceIds
        .map((id) => placeById.get(id))
        .filter(Boolean)
        .map((p) => ({
          id: p!.id, name: p!.name, category: p!.category,
          description: p!.description,
          address: p!.address ?? p!.arrondissement ?? "",
          arrondissement: p!.arrondissement,
          lat: p!.lat, lng: p!.lng,
          image_url: p!.image_url, tags: p!.tags ?? [],
          opening_hours: p!.opening_hours ?? null,
          price_range: p!.price_range, website_url: p!.website_url,
          instagram_url: null, is_featured: p!.is_featured,
          created_at: p!.created_at, is_saved: false,
        }));
    } else if (geminiSuggestedPlaces.length > 0) {
      // Mode B: Gemini's own knowledge
      hydratedPlaces = geminiSuggestedPlaces
        .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map((p, i) => ({
          id: `gemini-suggest-${Date.now()}-${i}`,
          name: p.name,
          category: p.category || "place",
          description: p.description || null,
          address: "", arrondissement: null,
          lat: p.lat, lng: p.lng,
          image_url: null, tags: [p.category || "place"],
          opening_hours: null, price_range: null, website_url: null,
          instagram_url: null, is_featured: false,
          created_at: new Date().toISOString(), is_saved: false,
        }));
    }

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
