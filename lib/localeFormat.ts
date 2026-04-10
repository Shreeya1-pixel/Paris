import type { Language } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

type TFn = (key: TranslationKey) => string;

/**
 * Event time string with localized day labels and locale time format.
 */
export function formatEventTimeLocalized(
  startTime: string,
  endTime: string | null,
  lang: Language,
  t: TFn
): string {
  const start = new Date(startTime);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diffDays = Math.round(
    (startDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  let dayLabel = "";
  if (diffDays === 0) dayLabel = t("time.today");
  else if (diffDays === 1) dayLabel = t("time.tomorrow");
  else if (diffDays < 7)
    dayLabel = start.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      weekday: "short",
    });
  else
    dayLabel = start.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      month: "short",
      day: "numeric",
    });

  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const startStr = start.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: lang === "en",
  });

  if (!endTime) return `${dayLabel} · ${startStr}`;
  const end = new Date(endTime);
  const endStr = end.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: lang === "en",
  });
  return `${dayLabel} · ${startStr} → ${endStr}`;
}

export function formatDistanceLocalized(km: number, _lang: Language, t: TFn): string {
  if (km < 1) {
    const m = Math.round(km * 1000);
    return t("distance.m").replace("{{n}}", String(m));
  }
  const k = km.toFixed(1);
  return t("distance.km").replace("{{n}}", k);
}
