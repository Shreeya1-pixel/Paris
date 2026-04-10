/**
 * 55 curated Paris places — single source for Tier-1 chat KB + optional DB seed.
 * Split across `parisCatalog/chunk*.ts` for maintainability.
 */

import type { ParisPlaceSeedRow } from "./parisPlacesTypes";
import { PARIS_CATALOG_CHUNK_1 } from "./parisCatalog/chunk1";
import { PARIS_CATALOG_CHUNK_2 } from "./parisCatalog/chunk2";
import { PARIS_CATALOG_CHUNK_3 } from "./parisCatalog/chunk3";
import { PARIS_CATALOG_CHUNK_4 } from "./parisCatalog/chunk4";
import { PARIS_CATALOG_CHUNK_5 } from "./parisCatalog/chunk5";

export type { ParisPlaceSeedRow, ParisSeedCategory } from "./parisPlacesTypes";

/** Full catalog in display order (cafés → restaurants → …). */
export const PARIS_PLACES: ParisPlaceSeedRow[] = [
  ...PARIS_CATALOG_CHUNK_1,
  ...PARIS_CATALOG_CHUNK_2,
  ...PARIS_CATALOG_CHUNK_3,
  ...PARIS_CATALOG_CHUNK_4,
  ...PARIS_CATALOG_CHUNK_5,
];

/** Alias for clarity in app code. */
export const PARIS_PLACES_CATALOG = PARIS_PLACES;

/**
 * `paris_places.category` is free TEXT; we use values that match `PlaceCategory`
 * so Discover / map place UI stay consistent.
 */
export function seedRowToDbCategory(row: ParisPlaceSeedRow): string {
  switch (row.category) {
    case "nightlife":
      return "club";
    case "art":
      return "gallery";
    default:
      return row.category;
  }
}

/** Row shape for `supabase.from("paris_places").insert(...)` */
export function seedRowToSupabaseInsert(row: ParisPlaceSeedRow) {
  return {
    name: row.name,
    category: seedRowToDbCategory(row),
    description: row.description,
    address: row.address,
    arrondissement: row.arrondissement,
    lat: row.lat,
    lng: row.lng,
    tags: row.tags,
    opening_hours: row.opening_hours,
    price_range: row.price_range,
    is_featured: row.is_featured,
    image_url: null as string | null,
    website_url: null as string | null,
    instagram_url: null as string | null,
  };
}
