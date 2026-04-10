"use client";

import type { TimeFilter } from "@/types";
import { useLanguage } from "@/components/LanguageProvider";
import { cn } from "@/lib/utils";

interface TimeToggleProps {
  value: TimeFilter;
  onChange: (v: TimeFilter) => void;
}

export function TimeToggle({ value, onChange }: TimeToggleProps) {
  const { t } = useLanguage();
  const OPTIONS: { value: TimeFilter; label: string }[] = [
    { value: "now",     label: t("map.now") },
    { value: "today",   label: t("map.today") },
    { value: "weekend", label: t("map.weekend") },
  ];

  return (
    <div className="flex rounded-full p-1 gap-0.5 bg-white/85 backdrop-blur-md border border-zinc-200/80 shadow-sm">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "h-8 px-3.5 rounded-full text-[11px] font-semibold transition-all duration-180",
            value === opt.value
              ? "bg-zinc-800 text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
