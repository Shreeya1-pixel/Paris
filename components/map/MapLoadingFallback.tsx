"use client";

import { useLanguage } from "@/components/LanguageProvider";

export function MapLoadingFallback() {
  const { t } = useLanguage();
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-zinc-800 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-zinc-500 font-medium">{t("map.loading")}</p>
      </div>
    </div>
  );
}
