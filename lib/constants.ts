import type { ParisCategory } from "@/types";
import { PARIS_CENTER } from "./geo";

export { PARIS_CENTER };
export const DEFAULT_MAP_CENTER = PARIS_CENTER;
export const DEFAULT_ZOOM = 13;
/** After GPS fix: building footprints & side streets visible (dense street-level UX) */
export const USER_LOCATION_ZOOM = 17;
export const DEFAULT_RADIUS_KM = 5;
export const PARIS_RADIUS_KM = 30; // max radius from Paris center
export const EVENTS_PAGE_LIMIT = 50;
export const PLACES_PAGE_LIMIT = 20;

export const CATEGORIES: {
  id: ParisCategory;
  label: string;
  emoji: string;
  color: string;
}[] = [
  { id: "cafe",      label: "Café",        emoji: "☕", color: "#C9A84C" },
  { id: "food",      label: "Restaurant",  emoji: "🍽️", color: "#E8845A" },
  { id: "bar",       label: "Bar & Wine",  emoji: "🍷", color: "#9B3A4A" },
  { id: "nightlife", label: "Nightlife",   emoji: "🌙", color: "#5B4FC9" },
  { id: "music",     label: "Live Music",  emoji: "🎵", color: "#3D7EAA" },
  { id: "art",       label: "Art & Expos", emoji: "🎨", color: "#2E8B6E" },
  { id: "culture",   label: "Culture",     emoji: "🏛️", color: "#8B6914" },
  { id: "outdoor",   label: "Outdoor",     emoji: "🌿", color: "#4A7C59" },
  { id: "market",    label: "Marché",      emoji: "🛍️", color: "#B07D3A" },
  { id: "sport",     label: "Sport",       emoji: "⚽", color: "#2E5FA3" },
  { id: "pop-up",    label: "Pop-up",      emoji: "✨", color: "#9B3D8A" },
];

// Keep legacy alias
export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.color])
);

export const VIBES: { value: string; label: string; emoji: string }[] = [
  { value: "chill",     label: "Chill",     emoji: "😌" },
  { value: "explore",   label: "Explore",   emoji: "🧭" },
  { value: "nightlife", label: "Nightlife", emoji: "🌙" },
  { value: "date",      label: "Date Night",emoji: "💫" },
  { value: "work",      label: "Work Mode", emoji: "☕" },
];

export const INTERESTS = [
  "Music", "Food", "Art", "Culture", "Sports",
  "Nightlife", "Outdoors", "Coffee",
];

export const ARRONDISSEMENTS = [
  "1er","2ème","3ème","4ème","5ème","6ème","7ème","8ème",
  "9ème","10ème","11ème","12ème","13ème","14ème","15ème",
  "16ème","17ème","18ème","19ème","20ème",
];
