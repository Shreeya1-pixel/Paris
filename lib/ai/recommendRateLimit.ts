/**
 * Three-layer rate limiter for /api/ai/recommend:
 *
 *  Layer 1 — Per-user  : max 8 requests per minute (keyed by IP / user ID)
 *  Layer 2 — Global    : max 200 requests per minute across all users
 *  Layer 3 — Daily cap : max 15,000 requests per UTC day
 *
 * In multi-instance deployments each instance has its own counters.
 * For stricter global control, back this with Redis.
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const PER_USER_LIMIT  = Number(process.env.RECOMMEND_USER_LIMIT    ?? 8);
const GLOBAL_LIMIT    = Number(process.env.RECOMMEND_GLOBAL_LIMIT  ?? 200);
const DAILY_LIMIT     = Number(process.env.RECOMMEND_DAILY_LIMIT   ?? 15_000);
const USER_WINDOW_MS  = 60_000;        // 1 minute
const GLOBAL_WINDOW_MS = 60_000;       // 1 minute

// ─── Per-user store ───────────────────────────────────────────────────────────

interface UserEntry {
  count: number;
  windowStart: number;
}
const userStore = new Map<string, UserEntry>();

// ─── Global (rolling 1-min) counter ──────────────────────────────────────────

let globalWindowStart = Date.now();
let globalCount = 0;

// ─── Daily counter ────────────────────────────────────────────────────────────

let dailyDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
let dailyCount = 0;

function maybeRollDaily(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyDate) {
    dailyDate = today;
    dailyCount = 0;
  }
}

// ─── Prune per-user store periodically ───────────────────────────────────────

let pruneCounter = 0;
function maybePrune(): void {
  if (++pruneCounter < 500) return;
  pruneCounter = 0;
  const now = Date.now();
  Array.from(userStore.entries()).forEach(([k, v]) => {
    if (now - v.windowStart > USER_WINDOW_MS) userStore.delete(k);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RecommendRateLimitResult {
  allowed: boolean;
  /** Which limit was hit ("user" | "global" | "daily") */
  reason?: "user" | "global" | "daily";
  /** Milliseconds until the user's window resets (for Retry-After). */
  retryAfterMs: number;
}

/** Check all three layers without consuming quota. */
export function checkRecommendLimit(userKey: string): RecommendRateLimitResult {
  maybePrune();
  maybeRollDaily();

  const now = Date.now();

  // ── Layer 3: daily cap ───────────────────────────────────────────────────
  if (dailyCount >= DAILY_LIMIT) {
    const msUntilMidnight =
      new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime() +
      24 * 60 * 60 * 1000 -
      now;
    return { allowed: false, reason: "daily", retryAfterMs: Math.max(0, msUntilMidnight) };
  }

  // ── Layer 2: global 1-min rolling window ─────────────────────────────────
  if (now - globalWindowStart > GLOBAL_WINDOW_MS) {
    globalWindowStart = now;
    globalCount = 0;
  }
  if (globalCount >= GLOBAL_LIMIT) {
    return {
      allowed: false,
      reason: "global",
      retryAfterMs: GLOBAL_WINDOW_MS - (now - globalWindowStart),
    };
  }

  // ── Layer 1: per-user 1-min rolling window ───────────────────────────────
  const entry = userStore.get(userKey);
  if (!entry || now - entry.windowStart > USER_WINDOW_MS) {
    userStore.set(userKey, { count: 0, windowStart: now });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (entry.count >= PER_USER_LIMIT) {
    return {
      allowed: false,
      reason: "user",
      retryAfterMs: USER_WINDOW_MS - (now - entry.windowStart),
    };
  }

  return { allowed: true, retryAfterMs: 0 };
}

/** Record one successful request — call after checkRecommendLimit returns allowed. */
export function consumeRecommendQuota(userKey: string): void {
  maybeRollDaily();
  const now = Date.now();

  // Global
  if (now - globalWindowStart > GLOBAL_WINDOW_MS) {
    globalWindowStart = now;
    globalCount = 0;
  }
  globalCount++;

  // Daily
  dailyCount++;

  // Per-user
  const entry = userStore.get(userKey);
  if (!entry || now - entry.windowStart > USER_WINDOW_MS) {
    userStore.set(userKey, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
}
