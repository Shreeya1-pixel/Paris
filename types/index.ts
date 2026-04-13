// Paris-specific types

export type ParisCategory =
  | "cafe"
  | "food"
  | "bar"
  | "nightlife"
  | "music"
  | "art"
  | "culture"
  | "outdoor"
  | "market"
  | "sport"
  | "pop-up";

// Keep legacy alias
export type EventCategory = ParisCategory;

export type VibeTag = "chill" | "explore" | "nightlife" | "date" | "work";

export type EventStatus = "active" | "cancelled" | "ended";
export type EventSource = "user" | "curated";

export type PriceRange = "€" | "€€" | "€€€" | "€€€€";

export type PlaceCategory =
  | "cafe"
  | "restaurant"
  | "bar"
  | "gallery"
  | "park"
  | "library"
  | "market"
  | "club"
  | "bookshop"
  | "boulangerie";

export interface User {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  vibes: string[];
  interests: string[];
  arrondissement: string | null;
  created_at: string;
}

/** Optional per-language copy for user-facing event text (JSONB on `events`). */
export type EventI18nField = Partial<Record<"en" | "fr", string>>;

export interface Event {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  /** When set, UI picks `title_i18n[lang]` then falls back to `title`. */
  title_i18n?: EventI18nField | null;
  description_i18n?: EventI18nField | null;
  category: ParisCategory;
  vibe_tags: string[];
  start_time: string;
  end_time: string | null;
  location_name: string | null;
  arrondissement: string | null;
  address: string | null;
  lat: number;
  lng: number;
  image_url: string | null;
  ticket_url: string | null;
  is_free: boolean;
  price: number | null;
  max_attendees: number | null;
  attendee_count: number;
  source: EventSource;
  status: EventStatus;
  created_at: string;
  creator?: Pick<User, "username" | "avatar_url">;
  distance_km?: number;
  is_saved?: boolean;
  is_attending?: boolean;
  /** Personalisation score (0–1). Populated by /api/events/feed. */
  feed_score?: number;
  /** Human-readable rank reason. Populated by /api/events/feed. */
  rank_label?: string;
}

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  description: string | null;
  address: string;
  arrondissement: string;
  lat: number;
  lng: number;
  image_url: string | null;
  tags: string[];
  opening_hours: Record<string, string> | null;
  price_range: PriceRange | null;
  website_url: string | null;
  instagram_url: string | null;
  is_featured: boolean;
  created_at: string;
  distance_km?: number;
  is_saved?: boolean;
}

export interface SavedEvent {
  id: string;
  user_id: string;
  event_id: string;
  saved_at: string;
  event?: Event;
}

export interface SavedPlace {
  id: string;
  user_id: string;
  place_id: string;
  saved_at: string;
  place?: Place;
}

export interface EventAttendee {
  id: string;
  user_id: string;
  event_id: string;
  joined_at: string;
}

export type TimeFilter = "now" | "today" | "weekend";

export interface FilterState {
  category: ParisCategory | null;
  timeFilter: TimeFilter;
  arrondissement?: string | null;
  lat?: number;
  lng?: number;
  radius?: number;
}

export interface DiscoverSections {
  now: Event[];
  weekend: Event[];
  forYou: Event[];
  cafes: Place[];
  gems: Place[];
  nearby: (Event | Place)[];
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface NearbyMapItem {
  id: string;
  type: "place" | "event";
  name: string;
  category: string;
  lat: number;
  lng: number;
  distance_km: number;
  start_time?: string | null;
  location_name?: string | null;
  arrondissement?: string | null;
}
