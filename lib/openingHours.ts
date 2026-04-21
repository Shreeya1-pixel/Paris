/**
 * Interpret `paris_places.opening_hours` (day keys: mon..sun) in a fixed timezone.
 * Used to drop venues that are known closed right now when APIs don't cover DB rows.
 */

const DAY_FROM_INTL: Record<string, string> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

/** Default for `paris_places` rows (Paris catalogue). */
export const PARIS_OPENING_HOURS_TZ = "Europe/Paris";

export function getClockInTimeZone(
  timeZone: string,
  d = new Date()
): { dayKey: string; minutes: number } {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d);
  const dayKey = DAY_FROM_INTL[wd] ?? "mon";
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
  const minutes = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  return { dayKey, minutes };
}

/**
 * @returns `true` open, `false` closed, `null` unknown / unparseable (caller may keep row).
 */
export function isPlaceOpenNowInZone(
  opening_hours: Record<string, string> | null | undefined,
  timeZone: string,
  now = new Date()
): boolean | null {
  if (!opening_hours || typeof opening_hours !== "object") return null;
  const { dayKey, minutes: cur } = getClockInTimeZone(timeZone, now);
  const raw = opening_hours[dayKey];
  if (raw == null || String(raw).trim() === "") return null;

  const s = String(raw).trim().toLowerCase();
  if (s === "closed" || s === "fermé" || s === "ferme") return false;
  if (s === "open" || s === "24h" || s === "24/7" || s === "all day") return true;

  const segments = s.split(",").map((x) => x.trim()).filter(Boolean);
  for (const seg of segments) {
    const m = seg.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const end = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
    if (end < start) {
      if (cur >= start || cur <= end) return true;
    } else {
      if (cur >= start && cur <= end) return true;
    }
  }

  if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(s)) return false;
  return null;
}
