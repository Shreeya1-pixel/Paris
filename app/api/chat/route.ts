/**
 * POST /api/chat
 *
 * Tiered response system:
 *
 *  Tier 1 — Local Knowledge Base ($0)
 *    Serves 35+ hardcoded Paris spots instantly via keyword matching.
 *    Handles queries like "cafe in marais", "techno club", "sunday market".
 *
 *  Tier 2 — AI Provider ($$)
 *    Used only when Tier 1 can't satisfy the query (complex/conversational
 *    queries, planning, or no local match).  Provider priority:
 *      GEMINI_API_KEY → GROQ_API_KEY → ANTHROPIC_API_KEY → OPENAI_API_KEY
 *
 *  Rate limiter
 *    Hard limit: 30 total requests / IP / 15 min.
 *    Soft limit:  5 AI calls      / IP / 15 min.
 *    When AI budget is exhausted, Tier-1 still works; only AI is blocked.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, consumeQuota, rateLimitMessage } from "@/lib/rateLimiter";
import { routeQuery } from "@/lib/chatRouter";
import { searchLocalKB } from "@/lib/localKnowledgeBase";
import type { LocalSpot } from "@/lib/localKnowledgeBase";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract client IP, respecting reverse-proxy headers. */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ─── AI provider wrappers ─────────────────────────────────────────────────────

/**
 * Google Gemini — cheapest, fastest, preferred when key is present.
 * Uses gemini-1.5-flash (free tier eligible).
 */
async function callGemini(system: string, user: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 600, temperature: 0.3 },
      }),
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

/** Groq — fast inference, great free limits. */
async function callGroq(system: string, user: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: 600,
      temperature: 0.3,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "{}";
}

/** Anthropic Claude — high quality, higher cost. */
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
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? "{}";
}

/** OpenAI — fallback of last resort. */
async function callOpenAI(system: string, user: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: 600,
      temperature: 0.3,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "{}";
}

/**
 * Call whichever AI provider is configured, in priority order.
 * Throws if no key is available.
 */
async function callAI(system: string, user: string): Promise<string> {
  if (process.env.GEMINI_API_KEY)    return callGemini(system, user);
  if (process.env.GROQ_API_KEY)      return callGroq(system, user);
  if (process.env.ANTHROPIC_API_KEY) return callAnthropic(system, user);
  if (process.env.OPENAI_API_KEY)    return callOpenAI(system, user);
  throw new Error("NO_AI_KEY");
}

// ─── Openworld system persona ─────────────────────────────────────────────────

const PARIS_SYSTEM_PROMPT = `
You are the AI guide for Openworld Paris — a real-time event and place discovery app 
focused exclusively on Paris, France.

Your personality: warm, knowledgeable, slightly Parisian — like a cool local friend who 
knows every hidden bar, every Sunday market, every great concert.

Paris neighbourhood guide you know well:
1er (Louvre, Châtelet, Palais-Royal), 2ème (Bourse, Grands Boulevards), 
3ème (Le Marais north), 4ème (Le Marais south, Île de la Cité, Beaubourg),
5ème (Latin Quarter), 6ème (Saint-Germain-des-Prés), 7ème (Eiffel Tower, Invalides),
8ème (Champs-Élysées, Grand Palais), 9ème (Pigalle, Opéra), 
10ème (Canal Saint-Martin, République, Gare du Nord), 11ème (Bastille, Oberkampf, Nation),
12ème (Bastille east, Bercy, Coulée Verte), 13ème (Butte-aux-Cailles, Chinatown, Austerlitz),
14ème (Montparnasse, Alésia), 15ème (residential west, Convention),
16ème (Trocadéro, Passy, Bois de Boulogne), 17ème (Batignolles, Clichy),
18ème (Montmartre, Pigalle, Jules Joffrin), 19ème (Buttes-Chaumont, La Villette, Belleville),
20ème (Belleville, Ménilmontant, Père-Lachaise)

Parisian vocabulary you use naturally:
apéro = pre-dinner drinks (6–9pm) | brasserie = traditional French restaurant |
marché = market | guinguette = outdoor riverside bar/dance | cave = wine cellar bar |
vernissage = art gallery opening | fête = party/festival | bouillon = cheap bistro |
flâner = strolling with no purpose (very Parisian)

Cultural intelligence:
• "techno" → Concrete (12ème), Rex Club (2ème), Wanderlust (13ème)
• "natural wine" → La Buvette (11ème), Le Baron Rouge (12ème)
• "jazz" → Caveau de la Huchette (5ème), Duc des Lombards (1er)
• "specialty coffee / café" → Télescope (1er), Ten Belles (10ème), Coutume (7ème)
• "hidden bar / speakeasy" → Moonshiner (11ème), Candelaria (3ème)
• "sunday market" → Marché Bastille (11ème), Marché d'Aligre (12ème)
• "romantic / date" → Musée Rodin garden, Jardin du Luxembourg, Sacré-Cœur steps
• "cheap eats" → Bouillon Pigalle (18ème), L'As du Fallafel (4ème), Marché d'Aligre

You have access to live events and curated places data.
Analyse the query, extract intent, and return the most relevant IDs.
`.trim();

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 0. Parse request ──────────────────────────────────────────────────────
  const { query, lat, lng, lang: rawLang } = await req.json() as {
    query?: string;
    lat?: number;
    lng?: number;
    lang?: string;
  };
  const lang = rawLang === "fr" ? "fr" : "en";

  if (!query?.trim()) {
    return NextResponse.json({ error: "No query provided" }, { status: 400 });
  }

  // ── 1. Rate limit check ───────────────────────────────────────────────────
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(ip);

  if (!rateLimit.allowed) {
    // Hard limit hit — no Tier 1 or Tier 2
    return NextResponse.json(
      {
        events: [],
        places: [],
        message: rateLimitMessage(lang, rateLimit.retryAfterMs),
        rateLimited: true,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
          "X-RateLimit-Reset": String(Date.now() + rateLimit.retryAfterMs),
        },
      }
    );
  }

  // ── 2. Route the query ────────────────────────────────────────────────────
  //    If AI budget is exhausted we force Tier 1; if Tier 1 has no match we
  //    return a graceful "AI unavailable" message rather than making a paid call.
  const forceLocal = !rateLimit.aiAllowed;
  const route = routeQuery(query, lang, false);

  // ── 3a. Tier 1 — serve from local knowledge base ($0) ────────────────────
  if (route.tier === "local") {
    consumeQuota(ip, false);
    const places = route.spots.map(localSpotToPlace);
    return NextResponse.json({
      events: [],
      places,
      message: route.message,
      tier: "local",
    });
  }

  // AI budget exhausted — try KB as fallback before hard-blocking
  if (forceLocal) {
    const { spots, message } = searchLocalKB(query, lang);
    consumeQuota(ip, false);
    if (spots.length > 0) {
      return NextResponse.json({
        events: [],
        places: spots.map(localSpotToPlace),
        message,
        tier: "local",
      });
    }
    // No local match + no AI budget → rate-limit message
    return NextResponse.json({
      events: [],
      places: [],
      message: rateLimitMessage(lang, rateLimit.retryAfterMs),
      rateLimited: true,
      tier: "local",
    });
  }

  // ── 3b. Tier 2 — AI provider ($$) ────────────────────────────────────────

  // Load live events + places from Supabase to give the AI real context
  let events: Record<string, unknown>[] = [];
  let places: Record<string, unknown>[] = [];

  try {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const akey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && akey) {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(url, akey);
      const [evRes, plRes] = await Promise.all([
        sb
          .from("events")
          .select("id, title, description, category, vibe_tags, start_time, location_name, arrondissement, is_free, lat, lng, title_i18n, description_i18n")
          .eq("status", "active")
          .gte("start_time", new Date().toISOString())
          .lte("start_time", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(80),
        sb
          .from("paris_places")
          .select("id, name, category, description, arrondissement, tags, price_range")
          .limit(60),
      ]);
      events = (evRes.data ?? []) as Record<string, unknown>[];
      places = (plRes.data ?? []) as Record<string, unknown>[];
    }
  } catch {
    // Continue with empty context — AI still responds usefully
  }

  const eventsCtx =
    events.length > 0
      ? JSON.stringify(
          events.map((e) => ({
            id: e.id,
            title: lang === "fr" && e.title_i18n
              ? ((e.title_i18n as Record<string, string>).fr ?? e.title)
              : e.title,
            category: e.category,
            vibes: e.vibe_tags,
            time: e.start_time,
            arrondissement: e.arrondissement,
            free: e.is_free,
            description: ((e.description as string) ?? "").slice(0, 80),
          }))
        )
      : "No live events in database right now";

  const placesCtx =
    places.length > 0
      ? JSON.stringify(
          places.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            arrondissement: p.arrondissement,
            tags: p.tags,
            price: p.price_range,
          }))
        )
      : "No places in database right now";

  const replyLang =
    lang === "fr"
      ? "Réponds en français. Ton chaleureux, parisien, comme un ami local."
      : "Reply in English. Warm, slightly Parisian voice — like a well-connected local friend.";

  const userMessage = `User query: "${query}"
User location: lat ${lat ?? 48.8566}, lng ${lng ?? 2.3522}
UI language: ${lang}

Live events (next 7 days): ${eventsCtx}
Curated places: ${placesCtx}

Return ONLY valid JSON — no markdown fences, no other text:
{
  "eventIds": ["uuid1", "uuid2"],
  "placeIds": ["uuid1"],
  "message": "One short friendly sentence for the user (max 25 words)."
}

${replyLang}`;

  let raw = "{}";
  try {
    raw = await callAI(PARIS_SYSTEM_PROMPT, userMessage);
    consumeQuota(ip, true); // AI was used → decrement AI budget
  } catch (err: unknown) {
    const noKey = err instanceof Error && err.message === "NO_AI_KEY";
    consumeQuota(ip, false);
    return NextResponse.json({
      events: [],
      places: [],
      message: noKey
        ? lang === "fr"
          ? "Ajoutez GEMINI_API_KEY (ou GROQ / ANTHROPIC / OPENAI) dans .env.local pour activer la recherche IA."
          : "Add GEMINI_API_KEY (or GROQ / ANTHROPIC / OPENAI) to .env.local to enable AI search."
        : lang === "fr"
        ? "La recherche IA est temporairement indisponible. Réessayez dans un instant."
        : "AI search is temporarily unavailable. Try again in a moment.",
      tier: "ai",
    });
  }

  // Strip any accidental markdown wrapper
  const cleaned = raw.replace(/^```json\n?/i, "").replace(/^```\n?/i, "").replace(/```$/i, "").trim();

  let parsed: { eventIds?: string[]; placeIds?: string[]; message?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({
      events: [],
      places: [],
      message:
        lang === "fr"
          ? "Impossible de décoder la réponse IA. Reformulez votre question !"
          : "Couldn't parse the AI response. Try rephrasing!",
      tier: "ai",
    });
  }

  // Hydrate IDs from Supabase
  let matchedEvents: unknown[] = [];
  let matchedPlaces: unknown[] = [];
  try {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const akey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && akey && (parsed.eventIds?.length || parsed.placeIds?.length)) {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(url, akey);
      const [evRes, plRes] = await Promise.all([
        parsed.eventIds?.length
          ? sb.from("events").select("*").in("id", parsed.eventIds)
          : Promise.resolve({ data: [] }),
        parsed.placeIds?.length
          ? sb.from("paris_places").select("*").in("id", parsed.placeIds)
          : Promise.resolve({ data: [] }),
      ]);
      matchedEvents = evRes.data ?? [];
      matchedPlaces = plRes.data ?? [];
    }
  } catch {
    // Return empty rather than crash
  }

  return NextResponse.json({
    events: matchedEvents,
    places: matchedPlaces,
    message:
      parsed.message ??
      (lang === "fr" ? "Voici ce que j'ai trouvé à Paris !" : "Here's what I found in Paris!"),
    tier: "ai",
  });
}

// ─── Shape adapters ───────────────────────────────────────────────────────────

/** Convert a LocalSpot to the Place shape the frontend renders. */
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
