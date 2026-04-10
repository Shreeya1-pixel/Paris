"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, Heart } from "lucide-react";
import { EventCard } from "@/components/discover/EventCard";
import { PlaceCard } from "@/components/discover/PlaceCard";
import { EventDetailModal } from "@/components/map/EventDetailModal";
import { PlaceDetailSheet } from "@/components/discover/PlaceDetailSheet";
import { useLanguage } from "@/components/LanguageProvider";
import { createClient } from "@/lib/supabase/client";
import { useUserLocation } from "@/hooks/useUserLocation";
import type { Event, Place } from "@/types";

type Tab = "events" | "places";

export default function SavedPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLanguage();
  const { coords } = useUserLocation();
  const [activeTab, setActiveTab] = useState<Tab>("events");
  const [savedEvents, setSavedEvents] = useState<Event[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailEvent, setDetailEvent] = useState<Event | null>(null);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      const nowIso = new Date().toISOString();
      const { data: se } = await supabase
        .from("saved_events")
        .select("event_id")
        .eq("user_id", user.id);
      const eids = (se ?? []).map((r: { event_id: string }) => r.event_id);
      if (eids.length) {
        const { data: evs } = await supabase
          .from("events")
          .select("*")
          .in("id", eids)
          .eq("status", "active")
          .gt("start_time", nowIso)
          .order("start_time", { ascending: true });
        if (!cancelled) setSavedEvents((evs ?? []) as Event[]);
      } else if (!cancelled) setSavedEvents([]);

      const { data: sp } = await supabase
        .from("saved_places")
        .select("place_id")
        .eq("user_id", user.id);
      const pids = (sp ?? []).map((r: { place_id: string }) => r.place_id);
      if (pids.length) {
        const { data: pls } = await supabase.from("paris_places").select("*").in("id", pids);
        if (!cancelled) setSavedPlaces((pls ?? []) as Place[]);
      } else if (!cancelled) setSavedPlaces([]);

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-dvh ow-app-bg flex items-center justify-center pb-nav">
        <div className="w-8 h-8 border-2 border-zinc-800 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh ow-app-bg pb-nav">
      <header className="sticky top-0 z-20 px-5 pt-12 pb-4 bg-white/70 backdrop-blur-xl border-b border-zinc-200/60">
        <h1 className="font-display text-3xl font-semibold text-zinc-900">{t("saved.title")}</h1>
        <div className="flex mt-4 gap-1">
          {(["events", "places"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="flex-1 h-9 rounded-pill text-sm font-sans font-medium transition-all"
              style={
                activeTab === tab
                  ? { background: "var(--accent-gold)", color: "var(--bg-base)" }
                  : {
                      background: "var(--bg-glass)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--bg-glass-border)",
                    }
              }
            >
              {tab === "events" ? t("common.events") : t("common.places")}
            </button>
          ))}
        </div>
      </header>

      <main className="px-5 py-6">
        <AnimatePresence mode="wait">
          {activeTab === "events" ? (
            <motion.div
              key="ev"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
            >
              {savedEvents.length === 0 ? (
                <EmptyState
                  icon={<Bookmark className="w-12 h-12" />}
                  title={t("saved.noEvents")}
                  sub={t("saved.noEventsSub")}
                />
              ) : (
                <div className="grid grid-cols-2 gap-3" data-stagger>
                  {savedEvents.map((e, i) => (
                    <EventCard
                      key={e.id}
                      event={{ ...e, is_saved: true }}
                      variant="portrait"
                      index={i}
                      onClick={() => setDetailEvent(e)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="pl"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {savedPlaces.length === 0 ? (
                <EmptyState
                  icon={<Heart className="w-12 h-12" />}
                  title={t("saved.noPlaces")}
                  sub={t("saved.noPlacesSub")}
                />
              ) : (
                <div className="grid grid-cols-2 gap-3" data-stagger>
                  {savedPlaces.map((p, i) => (
                    <PlaceCard
                      key={p.id}
                      place={{ ...p, is_saved: true }}
                      variant="card"
                      index={i}
                      onClick={() => setDetailPlace(p)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          userLat={coords.lat}
          userLng={coords.lng}
          onClose={() => setDetailEvent(null)}
        />
      )}
      {detailPlace && (
        <PlaceDetailSheet
          place={{ ...detailPlace, is_saved: true }}
          userLat={coords.lat}
          userLng={coords.lng}
          onClose={() => setDetailPlace(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-[var(--text-muted)] mb-4">{icon}</div>
      <p className="font-display text-2xl font-semibold text-[var(--text-primary)] mb-1">{title}</p>
      <p className="text-sm text-[var(--text-secondary)] max-w-xs">{sub}</p>
    </div>
  );
}
