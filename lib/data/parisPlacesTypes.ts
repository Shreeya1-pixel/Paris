/**
 * Curated Paris places — shared by Tier-1 chat KB and optional Supabase seed.
 * Categories match the seed list; map to `Place` / `LocalSpot` via helpers.
 */

export type ParisSeedCategory =
  | "cafe"
  | "restaurant"
  | "bar"
  | "nightlife"
  | "art"
  | "park"
  | "market"
  | "bookshop";

export interface ParisPlaceSeedRow {
  name: string;
  category: ParisSeedCategory;
  description: string;
  address: string;
  arrondissement: string;
  lat: number;
  lng: number;
  tags: string[];
  price_range: string;
  opening_hours: Record<string, string>;
  is_featured: boolean;
}
