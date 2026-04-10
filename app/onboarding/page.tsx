"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, VIBES, ARRONDISSEMENTS } from "@/lib/constants";
import { useLanguage } from "@/components/LanguageProvider";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 3;

export default function OnboardingPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [selectedArr, setSelectedArr] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const toggleItem = (val: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const handleFinish = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("users")
        .update({
          interests: selectedCategories,
          vibes: selectedVibes,
          arrondissement: selectedArr || null,
        })
        .eq("id", user.id);
    }
    router.push("/map");
  };

  const canNext = step === 0
    ? selectedCategories.length >= 1
    : step === 1
    ? selectedVibes.length >= 1
    : true;

  const steps = [
    {
      title: t("onb.s1.title"),
      subtitle: t("onb.s1.sub"),
      content: (
        <div className="flex flex-wrap gap-2.5 justify-center">
          {CATEGORIES.map((cat) => {
            const active = selectedCategories.includes(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleItem(cat.id, selectedCategories, setSelectedCategories)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-pill text-sm font-sans border transition-all duration-180",
                  active
                    ? "border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                    : "border-[var(--bg-glass-border)] text-[var(--text-secondary)] bg-[var(--bg-glass)] hover:border-white/20"
                )}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: t("onb.s2.title"),
      subtitle: t("onb.s2.sub"),
      content: (
        <div className="flex flex-wrap gap-2.5 justify-center">
          {VIBES.map((vibe) => {
            const active = selectedVibes.includes(vibe.value);
            return (
              <button
                key={vibe.value}
                type="button"
                onClick={() => toggleItem(vibe.value, selectedVibes, setSelectedVibes)}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-pill text-sm font-sans border transition-all duration-180",
                  active
                    ? "border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                    : "border-[var(--bg-glass-border)] text-[var(--text-secondary)] bg-[var(--bg-glass)] hover:border-white/20"
                )}
              >
                <span>{vibe.emoji}</span>
                <span>{vibe.label}</span>
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: t("onb.s3.title"),
      subtitle: t("onb.s3.sub"),
      content: (
        <div className="flex flex-wrap gap-2 justify-center">
          {ARRONDISSEMENTS.map((arr) => {
            const active = selectedArr === arr;
            return (
              <button
                key={arr}
                type="button"
                onClick={() => setSelectedArr(active ? "" : arr)}
                className={cn(
                  "px-4 py-2 rounded-pill text-sm font-sans border transition-all duration-180",
                  active
                    ? "border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                    : "border-[var(--bg-glass-border)] text-[var(--text-secondary)] bg-[var(--bg-glass)] hover:border-white/20"
                )}
              >
                {arr}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSelectedArr("skip")}
            className="px-4 py-2 rounded-pill text-sm font-sans border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            {t("onb.skip")}
          </button>
        </div>
      ),
    },
  ];

  const current = steps[step];

  return (
    <div className="min-h-dvh bg-[var(--bg-base)] flex flex-col">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[var(--accent-gold)] opacity-[0.04] blur-[120px]" />
      </div>

      {/* Sticky header */}
      <header className="sticky top-0 z-20 px-6 pt-12 pb-4 backdrop-blur-glass bg-[var(--bg-base)]/80">
        <div className="flex justify-center gap-2 mb-6">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i <= step ? "bg-[var(--accent-gold)] w-8" : "bg-[var(--bg-glass-border)] w-4"
              )}
            />
          ))}
        </div>
        <h1 className="font-display text-3xl font-semibold text-[var(--text-primary)] text-center">
          {current.title}
        </h1>
        <p className="font-sans text-sm text-[var(--text-secondary)] text-center mt-1">
          {current.subtitle}
        </p>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 py-6 pb-[88px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {current.content}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[var(--bg-base)] to-transparent">
        <button
          type="button"
          disabled={!canNext || saving}
          onClick={() => (step < TOTAL_STEPS - 1 ? setStep(step + 1) : handleFinish())}
          className={cn(
            "w-full h-14 rounded-pill flex items-center justify-center gap-2 font-sans font-medium text-sm transition-all",
            canNext && !saving
              ? "bg-[var(--accent-gold)] text-[var(--bg-base)] hover:bg-[var(--accent-gold-light)] shadow-glow"
              : "bg-[var(--bg-glass)] text-[var(--text-muted)] cursor-not-allowed"
          )}
        >
          {saving ? t("onb.saving") : step < TOTAL_STEPS - 1 ? (
            <><span>{t("common.continue")}</span><ChevronRight className="w-4 h-4" /></>
          ) : t("onb.enter")}
        </button>
      </div>
    </div>
  );
}
