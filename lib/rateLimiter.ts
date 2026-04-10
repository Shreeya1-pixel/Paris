/**
 * In-memory rate limiter for the Openworld AI chat endpoint.
 *
 * Tracks per-IP usage in a module-level Map — works reliably in
 * Node.js (Next.js default runtime).  In a multi-instance deployment
 * (Vercel) each instance has its own store, so limits are per-instance.
 * For stricter global limiting, swap this for Upstash Redis later.
 *
 * Budget rules (configurable via env vars or constants below):
 *   • Max 5 Gemini/AI API calls per IP per 15-minute window   → SOFT limit
 *   • Max 30 total requests (Tier 1 + Tier 2) per IP per 15 min → HARD limit
 */

// ─── Config ───────────────────────────────────────────────────────────────────

/** Maximum Gemini / AI provider calls per window. */
const AI_CALL_LIMIT = Number(process.env.RATE_AI_LIMIT ?? 5);

/** Maximum total chat requests (local + AI) per window. */
const TOTAL_REQUEST_LIMIT = Number(process.env.RATE_TOTAL_LIMIT ?? 30);

/** Sliding window length in milliseconds (default: 15 minutes). */
const WINDOW_MS = Number(process.env.RATE_WINDOW_MS ?? 15 * 60 * 1000);

// ─── Store ────────────────────────────────────────────────────────────────────

interface Entry {
  /** Number of Tier-2 (AI) calls consumed in this window. */
  aiCalls: number;
  /** Total requests (Tier 1 + Tier 2) in this window. */
  totalRequests: number;
  /** Unix timestamp when this window started. */
  windowStart: number;
}

// Key = client IP string
const store = new Map<string, Entry>();

// Periodic GC so the Map doesn't grow unbounded in long-lived processes.
let gcCounter = 0;
function maybePrune() {
  if (++gcCounter < 200) return;
  gcCounter = 0;
  const now = Date.now();
  store.forEach((entry, ip) => {
    if (now - entry.windowStart > WINDOW_MS) store.delete(ip);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RateLimitResult {
  /** Whether the request is allowed at all. */
  allowed: boolean;
  /** Whether the request may call the AI (Tier 2). */
  aiAllowed: boolean;
  /** Milliseconds until the current window resets (for Retry-After header). */
  retryAfterMs: number;
}

/**
 * Check rate-limit status for an IP without consuming any quota.
 * Call this before deciding which tier to use.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  maybePrune();
  const now = Date.now();
  const entry = store.get(ip);

  // Fresh window or expired window — reset
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(ip, { aiCalls: 0, totalRequests: 0, windowStart: now });
    return { allowed: true, aiAllowed: true, retryAfterMs: 0 };
  }

  const retryAfterMs = WINDOW_MS - (now - entry.windowStart);

  // Hard cap: too many total requests from this IP
  if (entry.totalRequests >= TOTAL_REQUEST_LIMIT) {
    return { allowed: false, aiAllowed: false, retryAfterMs };
  }

  // Soft cap: AI budget exhausted but local KB still allowed
  const aiAllowed = entry.aiCalls < AI_CALL_LIMIT;
  return { allowed: true, aiAllowed, retryAfterMs };
}

/**
 * Record that a request was made (call after checkRateLimit says allowed).
 * Pass `usedAI = true` only when an actual AI provider was called.
 */
export function consumeQuota(ip: string, usedAI: boolean): void {
  const entry = store.get(ip);
  if (!entry) return;           // shouldn't happen, but guard
  entry.totalRequests++;
  if (usedAI) entry.aiCalls++;
}

/**
 * Build the friendly rate-limit message for the user-facing chat.
 */
export function rateLimitMessage(
  lang: "en" | "fr",
  retryAfterMs: number
): string {
  const minutes = Math.ceil(retryAfterMs / 60_000);
  return lang === "fr"
    ? `Wow, tu explores trop vite ! Fais une petite pause. Réessaie dans ${minutes} minute${minutes > 1 ? "s" : ""}, ou consulte la carte en attendant.`
    : `Whoa, you're exploring too fast! Let's take a breather. Ask me again in ${minutes} minute${minutes > 1 ? "s" : ""}, or check out the map for now.`;
}
