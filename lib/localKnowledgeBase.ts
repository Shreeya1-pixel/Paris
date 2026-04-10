/**
 * Tier-1 Local Knowledge Base — Paris only ($0, no Gemini).
 *
 * Data source: `lib/data/parisPlacesCatalog.ts` (55 curated spots).
 * Served when keyword search scores above threshold; else chat routes to AI.
 */

import type { ParisPlaceSeedRow } from "@/lib/data/parisPlacesTypes";
import { PARIS_PLACES_CATALOG } from "@/lib/data/parisPlacesCatalog";

export interface LocalSpot {
  id: string;
  name: string;
  category:
    | "cafe"
    | "restaurant"
    | "bar"
    | "club"
    | "park"
    | "museum"
    | "landmark"
    | "market"
    | "bookshop"
    | "gallery";
  arrondissement: string;
  neighborhood: string;
  description: string;
  tags: string[];
  address: string;
  lat: number;
  lng: number;
  price_range: string;
  website_url: string | null;
  opening_hours: Record<string, string> | null;
  is_featured: boolean;
  image_url: null;
  instagram_url: null;
  created_at: string;
}

function seedCategoryToLocal(
  row: ParisPlaceSeedRow
): LocalSpot["category"] {
  switch (row.category) {
    case "cafe":
      return "cafe";
    case "restaurant":
      return "restaurant";
    case "bar":
      return "bar";
    case "nightlife":
      return "club";
    case "park":
      return "park";
    case "market":
      return "market";
    case "bookshop":
      return "bookshop";
    case "art":
      return /musée/i.test(row.name) ? "museum" : "gallery";
    default:
      return "gallery";
  }
}

function enrichTags(row: ParisPlaceSeedRow): string[] {
  const t = [...row.tags];
  const add = (x: string) => {
    if (!t.some((s) => s.toLowerCase() === x.toLowerCase())) t.push(x);
  };
  switch (row.category) {
    case "nightlife":
      add("nightlife");
      add("club");
      break;
    case "art":
      add("art");
      if (/musée/i.test(row.name)) add("museum");
      break;
    case "restaurant":
      add("restaurant");
      break;
    case "bookshop":
      add("books");
      add("bookshop");
      break;
    case "market":
      add("market");
      add("food market");
      break;
    default:
      break;
  }
  return t;
}

function kbId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `kb-paris-${index}-${slug || "spot"}`;
}

function seedRowToLocalSpot(row: ParisPlaceSeedRow, index: number): LocalSpot {
  return {
    id: kbId(row.name, index),
    name: row.name,
    category: seedCategoryToLocal(row),
    arrondissement: row.arrondissement,
    neighborhood: row.arrondissement,
    description: row.description,
    tags: enrichTags(row),
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    price_range: row.price_range,
    website_url: null,
    opening_hours: row.opening_hours,
    is_featured: row.is_featured,
    image_url: null,
    instagram_url: null,
    created_at: new Date().toISOString(),
  };
}

export const ALL_SPOTS: LocalSpot[] = PARIS_PLACES_CATALOG.map(seedRowToLocalSpot);

// ─── Synonym expansion ────────────────────────────────────────────────────────

const SYNONYMS: Record<string, string[]> = {
  coffee: ["cafe", "coffee", "espresso", "specialty coffee", "latte"],
  café: ["cafe", "coffee"],
  kafe: ["cafe"],
  beer: ["bar", "bière", "brasserie"],
  wine: ["bar", "wine", "natural wine", "wine bar"],
  cocktail: ["bar", "cocktails", "craft cocktails", "speakeasy"],
  eat: ["restaurant", "food", "lunch", "dinner"],
  food: ["restaurant", "food"],
  lunch: ["restaurant", "lunch", "food"],
  dinner: ["restaurant", "dinner", "food"],
  breakfast: ["bakery", "breakfast", "morning"],
  brunch: ["brunch", "cafe"],
  bakery: ["bakery", "bread", "pastry"],
  bread: ["bakery", "bread"],
  pastry: ["pastry", "croissant"],
  crêpe: ["crêpes", "galettes"],
  crepe: ["crêpes", "galettes"],
  falafel: ["falafel", "marais"],
  pizza: ["restaurant", "food", "italian", "pasta"],
  pasta: ["italian", "pasta", "restaurant"],
  italian: ["italian", "pasta", "restaurant"],
  bistro: ["bistro", "restaurant", "classic french", "bistronomie"],
  club: ["club", "nightlife", "dance"],
  dance: ["club", "dance", "nightlife", "swing", "salsa"],
  techno: ["techno", "electronic", "rave", "club"],
  rave: ["techno", "rave", "club", "nightlife"],
  house: ["house", "electronic", "club"],
  electronic: ["electronic", "techno", "club"],
  nightlife: ["nightlife", "club", "bar", "late night"],
  art: ["art", "museum", "gallery", "exhibition"],
  museum: ["museum", "art"],
  gallery: ["gallery", "museum", "art", "contemporary art"],
  impressionism: ["impressionism", "monet", "museum"],
  park: ["park", "garden", "outdoor"],
  garden: ["park", "garden"],
  picnic: ["park", "picnic", "outdoor"],
  nature: ["park", "outdoor"],
  walk: ["park", "walk", "outdoor", "promenade"],
  run: ["park", "running"],
  canal: ["canal", "canal saint-martin", "10ème"],
  jazz: ["jazz", "live music"],
  live: ["live music", "concert", "jazz"],
  concert: ["concert", "live music"],
  market: ["market", "food market"],
  marché: ["market", "food market"],
  books: ["bookshop", "english books", "books"],
  bookshop: ["bookshop", "english books", "books"],
  eiffel: ["eiffel tower", "iconic", "landmark"],
  montmartre: ["montmartre", "18eme"],
  musée: ["museum"],
  parc: ["park"],
  boulangerie: ["bakery", "bread", "boulangerie"],
  guinguette: ["bar", "riverside", "outdoor"],
  cave: ["bar", "wine"],
  apéro: ["bar", "apéro"],
  apero: ["bar", "apéro"],
  pigalle: ["pigalle", "south pigalle", "9ème"],
  marais: ["marais", "3ème", "4ème"],
};

function expandQuery(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^\w\sàâäéèêëîïôùûüç']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const expanded = new Set<string>(words);
  for (const word of words) {
    const syns = SYNONYMS[word];
    if (syns) syns.forEach((s) => expanded.add(s));
  }
  return Array.from(expanded);
}

function scoreSpot(spot: LocalSpot, queryTokens: string[]): number {
  let score = 0;
  const nameWords = spot.name.toLowerCase().split(/\s+/);
  const hood = spot.neighborhood.toLowerCase();
  const arrond = spot.arrondissement.toLowerCase();

  for (const token of queryTokens) {
    if (!token || token.length < 2) continue;

    if (nameWords.some((w) => w === token)) score += 5;
    else if (nameWords.some((w) => w.includes(token) || token.includes(w))) score += 2;

    if (arrond.includes(token) || token.includes(arrond.replace("ème", "").replace("er", "")))
      score += 4;
    if (hood.includes(token)) score += 4;

    if (spot.category === token) score += 3;

    for (const tag of spot.tags) {
      const tl = tag.toLowerCase();
      if (tl === token) score += 3;
      else if (tl.includes(token) || token.includes(tl)) score += 1;
    }
  }

  if (score > 0 && spot.is_featured) score += 1;

  return score;
}

interface SearchResult {
  spots: LocalSpot[];
  message: string;
}

export function searchLocalKB(
  query: string,
  lang: "en" | "fr" = "en",
  topN = 3
): SearchResult {
  const tokens = expandQuery(query);
  const MIN_SCORE = 2;

  const scored = ALL_SPOTS.map((spot) => ({
    spot,
    score: scoreSpot(spot, tokens),
  }))
    .filter(({ score }) => score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  if (scored.length === 0) return { spots: [], message: "" };

  const spots = scored.map(({ spot }) => spot);
  const first = spots[0].name;
  const count = spots.length;

  const message =
    lang === "fr"
      ? `J'ai trouvé ${count} endroit${count > 1 ? "s" : ""} parfait${count > 1 ? "s" : ""} — ${first} est un excellent choix pour commencer !`
      : `Found ${count} great spot${count > 1 ? "s" : ""} for you — ${first} is an amazing place to start!`;

  return { spots, message };
}
