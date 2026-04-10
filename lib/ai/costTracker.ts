/**
 * In-process cost tracker for the /api/ai/recommend endpoint.
 *
 * Strategy
 * --------
 * We estimate cost per Gemini call rather than counting exact tokens:
 *   • ~500 tokens blended (input + output) @ gemini-1.5-flash rates
 *   • Input  $0.075  / 1M tokens  →  $0.0000375  per 500-token input
 *   • Output $0.30   / 1M tokens  →  $0.00015    per 500-token output
 *   • Conservative blended estimate: $0.0003 per call
 *
 * Hard stop: if running monthly total >= $50, all Gemini calls are blocked
 * and the fallback (DB results sorted by distance) is returned instead.
 *
 * In multi-instance deployments (Vercel) each instance tracks independently,
 * so the real usage could be N×. Swap to Redis for exact global tracking.
 */

// ─── Config ───────────────────────────────────────────────────────────────────

/** Conservative estimated USD cost per Gemini API call. */
export const COST_PER_CALL_USD = Number(
  process.env.AI_COST_PER_CALL_USD ?? "0.0003"
);

/** Monthly hard limit in USD. Once reached, AI calls stop. */
export const MONTHLY_BUDGET_USD = Number(
  process.env.AI_MONTHLY_BUDGET_USD ?? "50"
);

// ─── State ────────────────────────────────────────────────────────────────────

interface CostState {
  /** Total AI calls made this calendar month. */
  calls: number;
  /** Estimated total USD spent this calendar month. */
  estimatedUsd: number;
  /** YYYY-MM string for the current billing month. */
  month: string;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

let state: CostState = {
  calls: 0,
  estimatedUsd: 0,
  month: currentMonth(),
};

function maybeRollMonth(): void {
  const m = currentMonth();
  if (m !== state.month) {
    state = { calls: 0, estimatedUsd: 0, month: m };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns `true` when the monthly budget has been reached or exceeded.
 * Always call this BEFORE attempting a Gemini request.
 */
export function isBudgetExhausted(): boolean {
  maybeRollMonth();
  return state.estimatedUsd >= MONTHLY_BUDGET_USD;
}

/**
 * Record one successful Gemini call.
 * Call this AFTER the API returns (even on non-200 so we don't over-count).
 */
export function recordCall(): void {
  maybeRollMonth();
  state.calls += 1;
  state.estimatedUsd += COST_PER_CALL_USD;
}

/** Read-only snapshot for debugging / observability. */
export function getCostSnapshot(): Readonly<CostState & { budgetUsd: number }> {
  maybeRollMonth();
  return { ...state, budgetUsd: MONTHLY_BUDGET_USD };
}
