/**
 * Haversine distance in km between two lat/lng points
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Format event time for display e.g. "Tonight · 9PM → 11PM"
 */
export function formatEventTime(
  startTime: string,
  endTime: string | null
): string {
  const start = new Date(startTime);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate()
  );
  const diffDays = Math.round(
    (startDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  let dayLabel = "";
  if (diffDays === 0) dayLabel = "Today";
  else if (diffDays === 1) dayLabel = "Tomorrow";
  else if (diffDays < 7) dayLabel = start.toLocaleDateString("en-US", { weekday: "short" });
  else dayLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const startStr = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (!endTime) return `${dayLabel} · ${startStr}`;
  const end = new Date(endTime);
  const endStr = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${dayLabel} · ${startStr} → ${endStr}`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
