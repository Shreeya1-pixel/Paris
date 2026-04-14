/**
 * Limits Gemini assistant turns per browser session (server-side).
 * Client sends a stable `sessionId` (e.g. sessionStorage UUID).
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ASSISTANT_TURNS = 30;

interface Entry {
  count: number;
  windowStart: number;
}

const store = new Map<string, Entry>();

function prune(key: string) {
  const e = store.get(key);
  if (!e) return;
  if (Date.now() - e.windowStart > WINDOW_MS) store.delete(key);
}

export function assistantQuotaStatus(sessionKey: string): {
  allowed: boolean;
  remaining: number;
} {
  const key = sessionKey.trim() || "__anonymous__";
  prune(key);
  const now = Date.now();
  let e = store.get(key);
  if (!e || now - e.windowStart > WINDOW_MS) {
    e = { count: 0, windowStart: now };
    store.set(key, e);
  }
  const remaining = Math.max(0, MAX_ASSISTANT_TURNS - e.count);
  return { allowed: e.count < MAX_ASSISTANT_TURNS, remaining };
}

/** Call after a successful Gemini assistant response. */
export function consumeAssistantTurn(sessionKey: string): number {
  const key = sessionKey.trim() || "__anonymous__";
  const now = Date.now();
  let e = store.get(key);
  if (!e || now - e.windowStart > WINDOW_MS) {
    e = { count: 0, windowStart: now };
    store.set(key, e);
  }
  e.count++;
  return Math.max(0, MAX_ASSISTANT_TURNS - e.count);
}
