import { NextRequest, NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/geminiEnv";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

type InsightBody = {
  name?: string;
  category?: string;
  description?: string | null;
  tags?: string[];
  arrondissement?: string;
};

async function callGeminiInsight(body: InsightBody): Promise<{ tagline: string; quote: string }> {
  const key = getGeminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const system = `You are a concise Paris food & culture guide. Reply with ONLY valid JSON, no markdown:
{"tagline":"max 90 characters, evocative","quote":"max 220 characters, sounds like a happy visitor review"}`;

  const user = [
    `Place name: ${body.name ?? ""}`,
    `Category: ${body.category ?? ""}`,
    `Area: ${body.arrondissement ?? ""}`,
    `Tags: ${(body.tags ?? []).join(", ")}`,
    `Notes: ${(body.description ?? "").slice(0, 600)}`,
  ].join("\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 400, temperature: 0.45 },
      }),
    }
  );

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { tagline?: string; quote?: string };
    return {
      tagline: typeof parsed.tagline === "string" ? parsed.tagline : "",
      quote: typeof parsed.quote === "string" ? parsed.quote : "",
    };
  } catch {
    return { tagline: "", quote: text.slice(0, 280) };
  }
}

export async function POST(req: NextRequest) {
  let body: InsightBody;
  try {
    body = (await req.json()) as InsightBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  try {
    const { tagline, quote } = await callGeminiInsight(body);
    return NextResponse.json({ tagline, quote });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Insight failed";
    return NextResponse.json({ error: msg, tagline: "", quote: "" }, { status: 503 });
  }
}
