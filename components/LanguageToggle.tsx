"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/components/LanguageProvider";
import type { Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LanguageToggleProps {
  className?: string;
  size?: "sm" | "md";
  /** Unique when multiple toggles mount (Framer layoutId). */
  layoutId?: string;
}

export function LanguageToggle({
  className,
  size = "md",
  layoutId = "openworld-lang-pill",
}: LanguageToggleProps) {
  const { lang, setLang, t } = useLanguage();

  const options: { code: Language; label: string }[] = [
    { code: "en", label: "🇬🇧" },
    { code: "fr", label: "🇫🇷" },
  ];

  return (
    <div
      role="group"
      aria-label={t("profile.language")}
      className={cn(
        "inline-flex rounded-full p-0.5 bg-white/80 backdrop-blur-md border border-zinc-200/80 shadow-sm",
        size === "sm" ? "gap-0" : "gap-0.5",
        className
      )}
    >
      {options.map(({ code, label }) => {
        const active = lang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            className={cn(
              "relative rounded-full font-semibold transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[13px] leading-none" : "px-3 py-1.5 text-[15px] leading-none",
              active ? "text-white z-10" : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-zinc-900 shadow-sm"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
