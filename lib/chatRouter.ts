/**
 * Chat Router — decides whether a query can be served from the
 * local knowledge base (Tier 1, free) or needs the AI (Tier 2, paid).
 *
 * Decision tree:
 *   1. If the query contains "complex" patterns (planning, itineraries,
 *      multi-step reasoning, budgets) → Tier 2 immediately.
 *   2. If the word count exceeds the complexity threshold → Tier 2.
 *   3. Otherwise, try the local knowledge base.
 *      a. If it returns matches → Tier 1 ✓
 *      b. If no matches found  → Tier 2 (AI knows more than we cached).
 */

import { searchLocalKB, type LocalSpot } from "@/lib/localKnowledgeBase";

// ─── Complexity detection ─────────────────────────────────────────────────────

/**
 * Phrases that signal the user wants planning, advice, or reasoning —
 * tasks that need the AI rather than a simple place lookup.
 */
const AI_TRIGGER_PHRASES: string[] = [
  // Planning
  "plan", "itinerary", "route", "schedule", "organise", "organize",
  // Recommendations
  "suggest", "recommend", "what should", "where should", "best way",
  "help me", "i want to", "i need to", "can you",
  // Complex comparisons
  "vs", "versus", "compare", "difference between", "better",
  // Budget / conditional
  "budget", "under €", "under $", "cheap", "afford", "spend",
  "how much",
  // Romantic / special occasions
  "anniversary", "birthday", "surprise", "proposal", "honeymoon",
  // Multi-stop / itinerary signals
  "first then", "after that", "whole day", "full day", "evening then",
  "morning then", "sequence",
  // Open-ended advice
  "what if", "how do", "how should", "explain", "tell me about",
  "what's the", "what is",
];

/**
 * Words longer than this threshold ≈ a conversational / complex query.
 * Short queries like "cafe near marais" or "techno tonight" are local-friendly.
 */
const COMPLEX_WORD_COUNT = 13;

function isComplexQuery(query: string): boolean {
  const q = query.toLowerCase();
  const wordCount = q.split(/\s+/).filter(Boolean).length;

  // Long queries almost always need reasoning
  if (wordCount > COMPLEX_WORD_COUNT) return true;

  // AI trigger phrases
  return AI_TRIGGER_PHRASES.some((phrase) => q.includes(phrase));
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type Tier1Result = {
  tier: "local";
  spots: LocalSpot[];
  message: string;
};

export type Tier2Result = {
  tier: "ai";
  reason: "complex_query" | "no_local_match" | "ai_forced";
};

export type RouterResult = Tier1Result | Tier2Result;

// ─── Main router ─────────────────────────────────────────────────────────────

/**
 * Route a user query to the appropriate response tier.
 *
 * @param query   Raw user message
 * @param lang    UI language ("en" | "fr")
 * @param forceAI Skip local lookup and go straight to AI (e.g. when AI
 *                budget is not exhausted and the caller prefers freshness)
 */
export function routeQuery(
  query: string,
  lang: "en" | "fr" = "en",
  forceAI = false
): RouterResult {
  if (forceAI) return { tier: "ai", reason: "ai_forced" };

  // Step 1: reject complex queries immediately — they need AI reasoning
  if (isComplexQuery(query)) {
    return { tier: "ai", reason: "complex_query" };
  }

  // Step 2: try the local knowledge base
  const { spots, message } = searchLocalKB(query, lang);
  if (spots.length > 0) {
    return { tier: "local", spots, message };
  }

  // Step 3: local KB had no match — escalate to AI
  return { tier: "ai", reason: "no_local_match" };
}
