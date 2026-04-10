/** One Gemini-ranked recommendation item. */
export interface RecommendItem {
  /** Unique ID from the source DB row (event or place), or the local-KB id. */
  id: string;
  title: string;
  description: string;
  category: string;
  /** "event" | "place" */
  type: "event" | "place";
  lat?: number;
  lng?: number;
  arrondissement?: string;
  distance_km?: number;
  start_time?: string;
  is_free?: boolean;
  image_url?: string | null;
}

export type Vibe = "date" | "chill" | "nightlife" | "explore" | "work" | "";
