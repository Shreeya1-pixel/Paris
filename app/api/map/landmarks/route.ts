import { NextRequest, NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/geminiEnv";

export const dynamic = "force-dynamic";

const SYSTEM = `You are a local place expert. Given GPS coordinates, identify the top 5 must-visit landmarks or shops within 2km.
Return ONLY valid JSON:
{"landmarks":[{"name":"Name","category":"landmark","description":"Max 10 words.","lat":0.0,"lng":0.0}]}
Rules:
- Keep descriptions SHORT (max 10 words each).
- lat/lng: WGS84 decimal degrees, within 2km.
- category: landmark, shop, restaurant, cafe, temple, park, museum, market, or monument.
- Exactly 5 items.`;

async function callGeminiLandmarks(lat: number, lng: number): Promise<string> {
  const key = getGeminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const user = `The user is at latitude ${lat}, longitude ${lng}. What are the top 5 must-visit places within 2km?`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.25,
        },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    console.error("[landmarks] Gemini HTTP", res.status, errText.slice(0, 300));
    throw new Error(`Gemini HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    candidates?: {
      content?: {
        parts?: { text?: string; thought?: boolean }[];
      };
    }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.find((p) => !p.thought && p.text);
  return textPart?.text ?? "{}";
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Invalid lat/lng", landmarks: [] }, { status: 400 });
  }

  if (!getGeminiApiKey()) {
    return NextResponse.json({ landmarks: [], fallback: true, message: "GEMINI_API_KEY not configured" });
  }

  try {
    let raw = await callGeminiLandmarks(lat, lng);
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    console.log("[landmarks] raw Gemini response:", raw.slice(0, 800));

    const parsed = JSON.parse(raw) as {
      landmarks?: Record<string, unknown>[];
    };
    const list = parsed.landmarks ?? [];

    const landmarks = list
      .map((L) => {
        const name = (L.name ?? L.Name ?? "") as string;
        const category = (L.category ?? L.Category ?? "landmark") as string;
        const description = (L.description ?? L.Description ?? "") as string;
        const pLat = Number(L.lat ?? L.latitude ?? L.Lat);
        const pLng = Number(L.lng ?? L.longitude ?? L.Lng);
        return { name, category, description, lat: pLat, lng: pLng };
      })
      .filter(
        (L) =>
          L.name &&
          Number.isFinite(L.lat) &&
          Number.isFinite(L.lng)
      )
      .filter((L) => haversineM(lat, lng, L.lat, L.lng) <= 15000)
      .slice(0, 5)
      .map((L, i) => ({
        id: `gemini-landmark-${i}-${L.name.slice(0, 12).replace(/\s/g, "-")}`,
        name: L.name,
        category: L.category,
        description: L.description,
        lat: L.lat,
        lng: L.lng,
      }));

    console.log("[landmarks] parsed count:", list.length, "after filter:", landmarks.length);
    return NextResponse.json({ landmarks, fallback: landmarks.length === 0 });
  } catch (err) {
    console.error("[landmarks] error:", err);
    return NextResponse.json({
      landmarks: [],
      fallback: true,
      message: "Could not load landmark suggestions",
    });
  }
}
