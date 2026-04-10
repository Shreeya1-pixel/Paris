"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  Language,
  translations,
  TranslationKey,
  categoryTranslationKey,
  vibeTranslationKey,
} from "@/lib/i18n";
import { formatEventTimeLocalized, formatDistanceLocalized } from "@/lib/localeFormat";
import { getLocalizedEventTitle, getLocalizedEventDescription } from "@/lib/eventLocale";
import type { Event, ParisCategory } from "@/types";

type LanguageContextType = {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: TranslationKey) => string;
  formatEventTime: (startTime: string, endTime: string | null) => string;
  formatDistance: (km: number) => string;
  categoryLabel: (id: ParisCategory) => string;
  vibeLabel: (value: string) => string;
  eventTitle: (event: Event) => string;
  eventDescription: (event: Event) => string | null;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("openworld-lang") as Language;
    if (stored === "fr" || stored === "en") {
      setLangState(stored);
    } else {
      const browserLang = window.navigator.language.startsWith("fr") ? "fr" : "en";
      setLangState(browserLang);
    }
    setMounted(true);
  }, []);

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("openworld-lang", l);
      document.documentElement.lang = l;
    }
  }, []);

  const activeLang: Language = mounted ? lang : "en";

  useEffect(() => {
    if (mounted && typeof document !== "undefined") {
      document.documentElement.lang = activeLang;
    }
  }, [mounted, activeLang]);

  const t = useCallback(
    (key: TranslationKey) => {
      return translations[activeLang][key] ?? translations.en[key] ?? key;
    },
    [activeLang]
  );

  const formatEventTime = useCallback(
    (startTime: string, endTime: string | null) =>
      formatEventTimeLocalized(startTime, endTime, activeLang, t),
    [activeLang, t]
  );

  const formatDistance = useCallback(
    (km: number) => formatDistanceLocalized(km, activeLang, t),
    [activeLang, t]
  );

  const categoryLabel = useCallback(
    (id: ParisCategory) => t(categoryTranslationKey(id)),
    [t]
  );

  const vibeLabel = useCallback(
    (value: string) => {
      const k = vibeTranslationKey(value);
      return k ? t(k) : value;
    },
    [t]
  );

  const eventTitle = useCallback(
    (event: Event) => getLocalizedEventTitle(event, activeLang),
    [activeLang]
  );

  const eventDescription = useCallback(
    (event: Event) => getLocalizedEventDescription(event, activeLang),
    [activeLang]
  );

  const value = useMemo(
    () => ({
      lang: activeLang,
      setLang,
      t,
      formatEventTime,
      formatDistance,
      categoryLabel,
      vibeLabel,
      eventTitle,
      eventDescription,
    }),
    [
      activeLang,
      setLang,
      t,
      formatEventTime,
      formatDistance,
      categoryLabel,
      vibeLabel,
      eventTitle,
      eventDescription,
    ]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
};
