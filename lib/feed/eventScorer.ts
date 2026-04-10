/**
 * Deterministic event scorer for the personalised feed.
 *
 * Final score = 0.3 × proximity + 0.2 × time + 0.5 × preference
 *
 * All sub-scores are in [0, 1].
 */

import { haversineKm } from "@/lib/geo";
import type { Event } from "@/types";
import type { PreferenceProfile } from "./preferenceProfile";

// ─── Weights ──────────────────────────────────────────────────────────────────

const W_PROX = 0.30;
const W_TIME = 0.20;
const W_PREF = 0.50;

// ─── Sub-scorers ─────────────────────────────────────────────────────────────

/** Proximity score based on distance to user */
export function proximityScore(distKm: number): number {
  if (distKm < 3)  return 1.0;
  if (distKm < 5)  return 0.8;
  if (distKm < 10) return 0.5;
  return 0.2;
}

/** Time score based on how soon the event starts */
export function timeScore(startTimeIso: string): number {
  const now  = Date.now();
  const diff = new Date(startTimeIso).getTime() - now;
  if (diff < 0)                   return 0;   // already past
  if (diff < 1 * 60 * 60 * 1000) return 1.0; // within 1h (happening now / about to)
  if (diff < 6 * 60 * 60 * 1000) return 0.9; // within 6h
  if (diff < 24 * 60 * 60 * 1000) return 0.7; // within 24h
  return 0.4;                                   // further out
}

/**
 * Preference score.
 *
 * +0.5 if category matches user's top categories (normalised)
 * +0.3 if any vibe_tag overlaps user's top vibes
 * +0.2 if arrondissement matches user's top arrondissement
 * Capped at 1.0
 */
export function preferenceScore(
  event: Pick<Event, "category" | "vibe_tags" | "arrondissement">,
  profile: PreferenceProfile
): number {
  let score = 0;

  // Category match (0 – 0.5)
  const catWeight = profile.categories[event.category] ?? 0;
  score += 0.5 * catWeight;

  // Vibe overlap (0 – 0.3)
  const vibes = event.vibe_tags ?? [];
  if (vibes.length > 0) {
    const topVibeWeight = Math.max(
      0,
      ...vibes.map((v) => profile.vibes[v] ?? 0)
    );
    score += 0.3 * topVibeWeight;
  }

  // Arrondissement match (0 – 0.2)
  if (event.arrondissement) {
    const arrWeight = profile.arrondissements[event.arrondissement] ?? 0;
    score += 0.2 * arrWeight;
  }

  return Math.min(1, score);
}

// ─── Rank label ───────────────────────────────────────────────────────────────

export function rankLabel(
  distKm: number,
  prefScore: number,
  startTimeIso: string,
  isFree: boolean,
  hasBehavior: boolean,
  lang: "en" | "fr" = "en"
): string {
  const diff = new Date(startTimeIso).getTime() - Date.now();
  const within6h  = diff < 6  * 60 * 60 * 1000;
  const within24h = diff < 24 * 60 * 60 * 1000;

  if (hasBehavior && prefScore >= 0.5) {
    return lang === "fr" ? "Selon vos goûts" : "Based on your vibe";
  }
  if (distKm < 2) {
    return lang === "fr" ? "Tout près" : "Near you";
  }
  if (within6h) {
    return lang === "fr" ? "Bientôt" : "Starting soon";
  }
  if (isFree) {
    return lang === "fr" ? "Événement gratuit" : "Free event";
  }
  if (within24h) {
    return lang === "fr" ? "Ce soir à Paris" : "Popular tonight";
  }
  return lang === "fr" ? "À Paris ce week-end" : "This weekend";
}

// ─── Composite scorer ─────────────────────────────────────────────────────────

export interface ScoringContext {
  userLat: number;
  userLng: number;
  profile: PreferenceProfile;
  lang?: "en" | "fr";
}

export interface ScoredResult {
  event: Event;
  score: number;
  breakdown: { proximity: number; time: number; preference: number };
}

export function scoreEvent(event: Event, ctx: ScoringContext): ScoredResult {
  const distKm = haversineKm(ctx.userLat, ctx.userLng, event.lat, event.lng);
  const prox   = proximityScore(distKm);
  const time   = timeScore(event.start_time);
  const pref   = preferenceScore(event, ctx.profile);

  const score  = W_PROX * prox + W_TIME * time + W_PREF * pref;

  return {
    event: {
      ...event,
      distance_km: distKm,
      feed_score:  score,
      rank_label: rankLabel(
        distKm,
        pref,
        event.start_time,
        event.is_free,
        ctx.profile.hasBehavior,
        ctx.lang ?? "en"
      ),
    },
    score,
    breakdown: { proximity: prox, time, preference: pref },
  };
}
