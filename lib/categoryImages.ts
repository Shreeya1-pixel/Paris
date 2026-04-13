/**
 * Curated Unsplash photo IDs used as fallback images when an event/place has no image_url.
 * Each category maps to a deterministic, high-quality photo.
 */

const EVENT_CATEGORY_PHOTOS: Record<string, string> = {
  food:      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=75",
  cafe:      "https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=600&q=75",
  bar:       "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&q=75",
  nightlife: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&q=75",
  music:     "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&q=75",
  art:       "https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=600&q=75",
  culture:   "https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=600&q=75",
  outdoor:   "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&q=75",
  market:    "https://images.unsplash.com/photo-1533900298318-6b8da08a523e?w=600&q=75",
  "pop-up":  "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=600&q=75",
  sport:     "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600&q=75",
  default:   "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=600&q=75",
};

const PLACE_CATEGORY_PHOTOS: Record<string, string> = {
  cafe:        "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&q=75",
  restaurant:  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=75",
  bar:         "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&q=75",
  boulangerie: "https://images.unsplash.com/photo-1568254183919-78a4f43a2877?w=600&q=75",
  gallery:     "https://images.unsplash.com/photo-1545033131-485ea67fd7c3?w=600&q=75",
  park:        "https://images.unsplash.com/photo-1496564203457-11bb12075d90?w=600&q=75",
  library:     "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=600&q=75",
  market:      "https://images.unsplash.com/photo-1533900298318-6b8da08a523e?w=600&q=75",
  club:        "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&q=75",
  bookshop:    "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=75",
  default:     "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=600&q=75",
};

export function eventPlaceholderImage(category: string): string {
  return EVENT_CATEGORY_PHOTOS[category] ?? EVENT_CATEGORY_PHOTOS.default;
}

export function placePlaceholderImage(category: string): string {
  return PLACE_CATEGORY_PHOTOS[category] ?? PLACE_CATEGORY_PHOTOS.default;
}
