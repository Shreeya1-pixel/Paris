import type { ParisCategory } from "@/types";

/**
 * `events.category` uses ParisCategory; `paris_places.category` uses PlaceCategory.
 * Map selected discover filters so place queries use valid place categories.
 */
const EVENT_TO_PLACE: Partial<Record<ParisCategory, string[]>> = {
  cafe: ["cafe"],
  food: ["restaurant"],
  bar: ["bar"],
  nightlife: ["bar", "club"],
  music: ["club"],
  art: ["gallery"],
  culture: ["gallery", "bookshop"],
  outdoor: ["park", "market"],
  market: ["market"],
  sport: ["park"],
  "pop-up": [],
};

/**
 * @returns list of place categories to filter, or `null` if selection maps to none
 *         (e.g. only "pop-up") — caller should not run an unscoped place query.
 */
export function mapEventCategoriesToPlaceCategories(
  eventCategories: string[]
): string[] | null {
  const out = new Set<string>();
  for (const c of eventCategories) {
    const mapped = EVENT_TO_PLACE[c as ParisCategory];
    if (mapped?.length) mapped.forEach((x) => out.add(x));
  }
  if (out.size === 0) return null;
  return Array.from(out);
}
