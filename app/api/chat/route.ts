export const maxDuration = 30;

/**
 * POST /api/chat
 *
 * Tiered response system:
 *
 *  Tier 1 — Local Knowledge Base ($0)
 *    Serves 55 curated Paris spots instantly via keyword matching.
 *
 *  Tier 2 — Gemini AI ($$)
 *    Complex/conversational queries. Gemini receives both the live DB
 *    places AND the full local KB catalogue, so it always has 50+ spots
 *    to pick from — even if Supabase paris_places is empty.
 *
 *  Rate limiter
 *    Hard limit: 30 total requests / IP / 15 min.
 *    Soft limit:  5 AI calls      / IP / 15 min.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, consumeQuota, rateLimitMessage } from "@/lib/rateLimiter";
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

/**
 * Minimal guardrail: only block queries that are clearly unrelated to
 * map/place discovery. The system prompt handles everything else.
 */
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
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
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
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

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are the AI place guide for Openworld — a map-based discovery app.

Your ONLY job: help users find places to visit on the map.
Never answer coding, math, general trivia, weather, or anything unrelated to discovering places.

When a user asks about a place to eat, drink, explore, hang out, or visit — pick the best matching places from the catalogue provided and return their IDs.

Paris neighbourhood knowledge:
1er (Louvre, Châtelet), 3ème/4ème (Le Marais), 5ème (Latin Quarter),
6ème (Saint-Germain), 9ème (Pigalle, SoPi), 10ème (Canal Saint-Martin, République),
11ème (Bastille, Oberkampf), 18ème (Montmartre)

Cultural shortcuts:
• "natural wine" → La Buvette, Le Baron Rouge, Septime Cave
• "techno / club" → Rex Club, Concrete, Wanderlust
• "specialty coffee" → Télescope, Ten Belles, Coutume Café
• "hidden bar" → Moonshiner, Candelaria
• "sunday market" → Marché Bastille, Marché d'Aligre
• "romantic / date" → Jardin du Luxembourg, Musée Rodin garden

Always return ONLY valid JSON, no markdown, no prose outside JSON.
`.trim();

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { query, lat, lng, lang: rawLang } = await req.json() as {
    query?: string; lat?: number; lng?: number; lang?: string;
  };
  const lang = rawLang === "fr" ? "fr" : "en";

  if (!query?.trim()) {
    return NextResponse.json({ error: "No query provided" }, { status: 400 });
  }

  // Minimal guardrail — only block clearly off-topic requests
  if (isOffTopic(query)) {
    return NextResponse.json({
      events: [],
      places: [],
      message: lang === "fr"
        ? "Je suis ici pour t'aider à trouver des endroits sur la carte. Essaie : 'bar naturel près de Bastille'."
        : "I'm here to help you find places on the map. Try: 'natural wine bar near Bastille'.",
      tier: "guardrail",
    });
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(ip);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { events: [], places: [], message: rateLimitMessage(lang, rateLimit.retryAfterMs), rateLimited: true },
      { status: 429, headers: {
        "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        "X-RateLimit-Reset": String(Date.now() + rateLimit.retryAfterMs),
      }}
    );
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

  // 1. Fetch live DB places (may be empty) as additional context
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

  // 2. Build unified catalogue for Gemini — DB places first, then KB spots
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

  // Merge: DB takes priority (same name de-dupe by name)
  const dbNames = new Set(dbContext.map((p) => String(p.name).toLowerCase()));
  const mergedKB = kbContext.filter((k) => !dbNames.has(k.name.toLowerCase()));
  const allPlacesCtx = [...dbContext, ...mergedKB];

  const userMessage = `User query: "${query}"
User location: lat ${lat ?? 48.8566}, lng ${lng ?? 2.3522}
Language: ${lang}

Available places catalogue (${allPlacesCtx.length} spots):
${JSON.stringify(allPlacesCtx)}

Instructions:
- Pick the 1–5 most relevant place IDs from the catalogue above that match the query.
- ONLY use IDs that appear in the catalogue.
- Return ONLY valid JSON, no markdown:
{
  "placeIds": ["id1", "id2"],
  "message": "${lang === "fr" ? "Une phrase courte et chaleureuse (max 20 mots)." : "One short warm sentence (max 20 words)."}"
}`;

  let raw = "{}";
  try {
    raw = await callAI(SYSTEM_PROMPT, userMessage);
    consumeQuota(ip, true);
  } catch (err: unknown) {
    const noKey = err instanceof Error && err.message === "NO_AI_KEY";
    consumeQuota(ip, false);
    // Fall back to KB search before giving up
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

  // Strip markdown fences if present
  const cleaned = raw
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

  let parsed: { placeIds?: string[]; message?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // JSON parse failed — fall back to KB
    const { spots, message } = searchLocalKB(query, lang);
    return NextResponse.json({
      events: [],
      places: spots.length > 0 ? spots.map(localSpotToPlace) : [],
      message: spots.length > 0 ? message : (lang === "fr" ? "Voici quelques idées !" : "Here are some ideas!"),
      tier: "local",
    });
  }

  const pickedIds = parsed.placeIds ?? [];

  if (pickedIds.length === 0) {
    // Gemini found nothing — fall back to KB search
    const { spots, message } = searchLocalKB(query, lang);
    return NextResponse.json({
      events: [],
      places: spots.map(localSpotToPlace),
      message: spots.length > 0 ? message : (parsed.message ?? (lang === "fr" ? "Rien trouvé — réessayez !" : "Nothing found — try rephrasing!")),
      tier: spots.length > 0 ? "local" : "ai",
    });
  }

  // ── Hydrate: UUID IDs → Supabase, kb-paris-* IDs → local KB ─────────────
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

  // Maintain Gemini's ordering
  const hydratedById = new Map<string, unknown>();
  for (const p of supabasePlaces) hydratedById.set((p as { id: string }).id, p);
  for (const p of kbPlaces)       hydratedById.set(p.id, p);

  const orderedPlaces = pickedIds
    .map((id) => hydratedById.get(id))
    .filter(Boolean);

  // If hydration still empty, fall back to KB
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
    message: parsed.message ?? (lang === "fr" ? "Voici ce que j'ai trouvé !" : "Here's what I found!"),
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
