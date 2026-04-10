import type { Language } from "@/lib/i18n";
import type { Event } from "@/types";

export type EventI18nText = Partial<Record<Language, string>>;

/**
 * Resolve title for the active UI language, then fall back to canonical `title`.
 */
export function getLocalizedEventTitle(event: Event, lang: Language): string {
  const map = event.title_i18n;
  if (map && typeof map === "object") {
    const v = map[lang];
    if (v && v.trim()) return v.trim();
    const other: Language = lang === "en" ? "fr" : "en";
    const fallback = map[other];
    if (fallback && fallback.trim()) return fallback.trim();
  }
  return event.title;
}

export function getLocalizedEventDescription(
  event: Event,
  lang: Language
): string | null {
  const map = event.description_i18n;
  if (map && typeof map === "object") {
    const v = map[lang];
    if (v && v.trim()) return v.trim();
    const other: Language = lang === "en" ? "fr" : "en";
    const fallback = map[other];
    if (fallback && fallback.trim()) return fallback.trim();
  }
  return event.description;
}
