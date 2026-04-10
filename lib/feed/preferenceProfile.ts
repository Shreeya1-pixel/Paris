/**
 * Lightweight preference profile builder.
 *
 * Sources (in priority order):
 *  1. Saved events (most behavioral signal)
 *  2. Event attendees (if table exists)
 *  3. User onboarding: interests + vibes + arrondissement
 *
 * All computation is pure / synchronous — the caller fetches the raw data.
 */

export interface PreferenceProfile {
  /** category → normalised weight 0–1 (sum ≤ 1 not required) */
  categories: Record<string, number>;
  /** vibe_tag → normalised weight 0–1 */
  vibes: Record<string, number>;
  /** arrondissement → normalised weight 0–1 */
  arrondissements: Record<string, number>;
  /** true when we have real behavioral data (saves) */
  hasBehavior: boolean;
}

// ─── Saved-event rows (minimal shape we need) ─────────────────────────────────

export interface SavedEventRow {
  category: string;
  vibe_tags?: string[] | null;
  arrondissement?: string | null;
}

// ─── Raw normalise helper ─────────────────────────────────────────────────────

function normaliseCounts(counts: Record<string, number>): Record<string, number> {
  const max = Math.max(1, ...Object.values(counts));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    out[k] = v / max;
  }
  return out;
}

// ─── Cold-start: onboarding-only profile ────────────────────────────────────

export function buildColdStartProfile(
  interests: string[],
  vibes: string[],
  arrondissement: string | null | undefined
): PreferenceProfile {
  const categories: Record<string, number> = {};
  for (const i of interests) categories[i.toLowerCase()] = 1;

  const vibeMap: Record<string, number> = {};
  for (const v of vibes) vibeMap[v.toLowerCase()] = 1;

  const arrondissements: Record<string, number> = {};
  if (arrondissement) arrondissements[arrondissement] = 1;

  return {
    categories: normaliseCounts(categories),
    vibes: normaliseCounts(vibeMap),
    arrondissements: normaliseCounts(arrondissements),
    hasBehavior: false,
  };
}

// ─── Full profile from behavioral data ───────────────────────────────────────

export function buildPreferenceProfile(
  savedEvents: SavedEventRow[],
  /** From users.interests (onboarding) */
  interests: string[] = [],
  /** From users.vibes (onboarding) */
  userVibes: string[] = [],
  /** From users.arrondissement (onboarding) */
  homeArrondissement: string | null = null
): PreferenceProfile {
  // Cold start — no saves yet
  if (savedEvents.length === 0) {
    return buildColdStartProfile(interests, userVibes, homeArrondissement);
  }

  const catCount: Record<string, number> = {};
  const vibeCount: Record<string, number> = {};
  const arrCount: Record<string, number> = {};

  // Behavioral data carries more weight — counted naturally
  for (const e of savedEvents) {
    catCount[e.category] = (catCount[e.category] ?? 0) + 1;
    for (const v of e.vibe_tags ?? []) {
      vibeCount[v] = (vibeCount[v] ?? 0) + 1;
    }
    if (e.arrondissement) {
      arrCount[e.arrondissement] = (arrCount[e.arrondissement] ?? 0) + 1;
    }
  }

  // Onboarding as soft priors (weight = 0.5 relative to a single save)
  for (const i of interests) {
    const k = i.toLowerCase();
    catCount[k] = (catCount[k] ?? 0) + 0.5;
  }
  for (const v of userVibes) {
    const k = v.toLowerCase();
    vibeCount[k] = (vibeCount[k] ?? 0) + 0.5;
  }
  if (homeArrondissement) {
    arrCount[homeArrondissement] = (arrCount[homeArrondissement] ?? 0) + 0.5;
  }

  return {
    categories: normaliseCounts(catCount),
    vibes: normaliseCounts(vibeCount),
    arrondissements: normaliseCounts(arrCount),
    hasBehavior: true,
  };
}
