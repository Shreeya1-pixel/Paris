/**
 * Limits Gemini assistant turns per user per calendar day (server-side).
 * Client sends a stable `sessionId` (e.g. sessionStorage UUID).
 */

const MAX_ASSISTANT_TURNS = 5;

interface Entry {
  count: number;
  dayKey: string;
}

const store = new Map<string, Entry>();

function currentDayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function assistantQuotaStatus(sessionKey: string): {
  allowed: boolean;
  remaining: number;
} {
  const key = sessionKey.trim() || "__anonymous__";
  const dayKey = currentDayKey();
  let e = store.get(key);
  if (!e || e.dayKey !== dayKey) {
    e = { count: 0, dayKey };
    store.set(key, e);
  }
  const remaining = Math.max(0, MAX_ASSISTANT_TURNS - e.count);
  return { allowed: e.count < MAX_ASSISTANT_TURNS, remaining };
}

/** Call after a successful Gemini assistant response. */
export function consumeAssistantTurn(sessionKey: string): number {
  const key = sessionKey.trim() || "__anonymous__";
  const dayKey = currentDayKey();
  let e = store.get(key);
  if (!e || e.dayKey !== dayKey) {
    e = { count: 0, dayKey };
    store.set(key, e);
  }
  e.count++;
  return Math.max(0, MAX_ASSISTANT_TURNS - e.count);
}
