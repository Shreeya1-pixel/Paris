/** Paris centre — fallback when geolocation is denied or unavailable. */
export const PARIS_CENTER = { lat: 48.8566, lng: 2.3522 };

/** Max distance from Paris centre for user-created pins (≈ city + inner suburbs). */
export const PARIS_MAX_RADIUS_KM = 30;

/** Earth radius for Haversine (km). */
const R_KM = 6371;

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Whether a point lies within `maxKm` of Paris centre (for event creation validation). */
export function isWithinParisRegion(
  lat: number,
  lng: number,
  maxKm: number = PARIS_MAX_RADIUS_KM
): boolean {
  return haversineKm(PARIS_CENTER.lat, PARIS_CENTER.lng, lat, lng) <= maxKm;
}

/**
 * Bounding-box deltas (degrees) for a coarse prefilter before Haversine.
 * ~111 km per degree latitude; longitude scaled by cos(lat).
 */
export function bboxDeltas(lat: number, radiusKm: number): { dLat: number; dLng: number } {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { dLat, dLng };
}
