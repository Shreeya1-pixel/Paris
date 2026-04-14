"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import type { Event, Place } from "@/types";
import { EventCard } from "./EventCard";
import { PlaceCard } from "./PlaceCard";
import { SearchOverlay } from "./SearchOverlay";
import { useLanguage } from "@/components/LanguageProvider";
import type { SearchFilters } from "./SearchOverlay";

interface DiscoverFeedProps {
  happeningNow: Event[];
  upcoming: Event[];
  thisWeekend: Event[];
  forYou: Event[];
  bestCafes: Place[];
  hiddenGems: Place[];
  nearYou: (Event | Place)[];
  savedPlaces: Place[];
  savedPlacesLoading?: boolean;
  filters: SearchFilters;
  onFiltersApply: (f: SearchFilters) => void;
  searchMode: boolean;
  searchEvents: Event[];
  searchPlaces: Place[];
  searchLoading: boolean;
  discoverLoading?: boolean;
  /** Ticketmaster Discovery (proxied), upcoming within radius. */
  liveEvents?: Event[];
  liveLoading?: boolean;
  /** Server has TICKETMASTER_API_KEY — show live block. */
  liveConfigured?: boolean;
  /** Whether forYou has real personalisation (behavioural data). */
  isPersonalisedFeed?: boolean;
  onEventClick: (e: Event) => void;
  onPlaceClick: (p: Place) => void;
  onEventSave?: (e: Event) => void;
  onPlaceSave?: (p: Place) => void;
}

function SectionHeader({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle?: string;
  href?: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex items-end justify-between mb-4">
      <div>
        <h2 className="font-display text-2xl font-semibold text-zinc-900">{title}</h2>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-0.5 text-xs font-sans font-semibold text-zinc-800 hover:text-zinc-600 transition-colors"
        >
          {t("discover.seeAll")} <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

export function DiscoverFeed({
  happeningNow,
  upcoming,
  thisWeekend,
  forYou,
  bestCafes,
  hiddenGems,
  nearYou,
  savedPlaces,
  savedPlacesLoading = false,
  filters,
  onFiltersApply,
  searchMode,
  searchEvents,
  searchPlaces,
  searchLoading,
  discoverLoading,
  liveEvents = [],
  liveLoading = false,
  liveConfigured = false,
  isPersonalisedFeed,
  onEventClick,
  onPlaceClick,
  onEventSave,
  onPlaceSave,
}: DiscoverFeedProps) {
  const { t } = useLanguage();
  const [searchOpen, setSearchOpen] = useState(false);

  const activeFilterCount =
    (filters.q.trim() ? 1 : 0) +
    filters.categories.length +
    (filters.arrondissement ? 1 : 0) +
    (filters.freeOnly ? 1 : 0);

  const showDiscoverSections =
    !searchMode &&
    !discoverLoading &&
    !savedPlacesLoading &&
    happeningNow.length === 0 &&
    upcoming.length === 0 &&
    thisWeekend.length === 0 &&
    forYou.length === 0 &&
    bestCafes.length === 0 &&
    hiddenGems.length === 0 &&
    nearYou.length === 0 &&
    savedPlaces.length === 0 &&
    !liveLoading &&
    !liveConfigured;

  return (
    <div className="min-h-dvh pb-nav ow-app-bg">
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 pb-4 pt-safe-base bg-white/70 backdrop-blur-xl border-b border-zinc-200/60">
        <div>
          <h1 className="font-display text-3xl font-semibold text-zinc-900">{t("discover.title")}</h1>
          <p className="text-xs text-zinc-500 font-sans mt-0.5">{t("discover.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="relative w-10 h-10 rounded-full flex items-center justify-center text-zinc-800 bg-white/80 border border-zinc-200/80 shadow-sm hover:bg-white hover:border-zinc-300/80 transition-colors"
          aria-label="Filters"
        >
          <SlidersHorizontal className="w-5 h-5" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white border-2 border-white shadow-sm">
              {activeFilterCount > 9 ? "9+" : activeFilterCount}
            </span>
          )}
        </button>
      </header>

      <main className="px-5 py-6 space-y-10">
        {discoverLoading && !searchMode && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-zinc-800 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!searchMode && !discoverLoading && savedPlacesLoading && (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 border-2 border-zinc-800 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {searchMode && (
          <section>
            <SectionHeader title={t("discover.searchResults")} />
            {searchLoading && (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-2 border-zinc-800 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!searchLoading && searchEvents.length === 0 && searchPlaces.length === 0 && (
              <p className="text-sm text-zinc-500">{t("discover.empty")}</p>
            )}
            {!searchLoading && (searchEvents.length > 0 || searchPlaces.length > 0) && (
              <div className="space-y-3" data-stagger>
                {searchEvents.map((e, i) => (
                  <EventCard
                    key={`se-${e.id}`}
                    event={e}
                    variant="row"
                    index={i}
                    onClick={() => onEventClick(e)}
                    onSave={() => onEventSave?.(e)}
                  />
                ))}
                {searchPlaces.map((p, i) => (
                  <PlaceCard
                    key={`sp-${p.id}`}
                    place={p}
                    variant="row"
                    index={i + searchEvents.length}
                    onClick={() => onPlaceClick(p)}
                    onSave={() => onPlaceSave?.(p)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {showDiscoverSections && (
          <div className="text-center py-12 px-4">
            <p className="font-display text-lg text-zinc-800">{t("discover.empty")}</p>
            <p className="text-sm text-zinc-500 mt-2">{t("discover.emptySub")}</p>
          </div>
        )}

        {!searchMode && !discoverLoading && (
          <>
            {(liveLoading || liveConfigured) && (
              <section>
                <SectionHeader
                  title={t("discover.liveNearYou")}
                  subtitle={t("discover.liveNearYouSubtitle")}
                />
                {liveLoading && (
                  <div className="flex justify-center py-8">
                    <div className="w-7 h-7 border-2 border-zinc-800 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {!liveLoading && liveEvents.length === 0 && (
                  <p className="text-sm text-zinc-500">{t("discover.liveEmpty")}</p>
                )}
                {!liveLoading && liveEvents.length > 0 && (
                  <div className="max-h-[min(70vh,520px)] overflow-y-auto space-y-2">
                    {liveEvents.map((e, i) => (
                      <EventCard
                        key={e.id}
                        event={e}
                        variant="row"
                        index={i}
                        onClick={() => onEventClick(e)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {savedPlaces.length > 0 && (
              <section>
                <SectionHeader title={t("discover.savedPlaces")} subtitle={t("discover.savedPlacesSubtitle")} />
                <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
                  {savedPlaces.map((p, i) => (
                    <PlaceCard
                      key={`saved-${p.id}`}
                      place={p}
                      variant="card"
                      index={i}
                      onClick={() => onPlaceClick(p)}
                      onSave={() => onPlaceSave?.(p)}
                    />
                  ))}
                </div>
              </section>
            )}

            {happeningNow.length > 0 && (
              <section>
                <SectionHeader
                  title={t("discover.happeningNow")}
                  subtitle={t("discover.happeningNowSubtitle")}
                  href="/map?filter=now"
                />
                <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
                  {happeningNow.map((e, i) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      variant="landscape"
                      index={i}
                      onClick={() => onEventClick(e)}
                      onSave={() => onEventSave?.(e)}
                    />
                  ))}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section>
                <SectionHeader
                  title={t("discover.upcoming")}
                  subtitle={t("discover.upcomingSubtitle")}
                  href="/map"
                />
                <div className="space-y-2" data-stagger>
                  {upcoming.slice(0, 12).map((e, i) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      variant="row"
                      index={i}
                      onClick={() => onEventClick(e)}
                      onSave={() => onEventSave?.(e)}
                    />
                  ))}
                </div>
              </section>
            )}

            {thisWeekend.length > 0 && (
              <section>
                <SectionHeader title={t("discover.thisWeekend")} href="/map?filter=weekend" />
                <div className="grid grid-cols-2 gap-3" data-stagger>
                  {thisWeekend.slice(0, 6).map((e, i) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      variant="portrait"
                      index={i}
                      onClick={() => onEventClick(e)}
                      onSave={() => onEventSave?.(e)}
                    />
                  ))}
                </div>
              </section>
            )}

            {forYou.length > 0 && (
              <section>
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-zinc-900">{t("discover.forYou")}</h2>
                    <p className="text-xs mt-0.5" style={{ color: isPersonalisedFeed ? "var(--accent-gold, #C9A84C)" : undefined }}>
                      {isPersonalisedFeed
                        ? "✦ Personalised from your saves"
                        : t("discover.forYouSubtitle")}
                    </p>
                  </div>
                </div>
                <div className="space-y-2" data-stagger>
                  {forYou.slice(0, 10).map((e, i) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      variant="row"
                      index={i}
                      onClick={() => onEventClick(e)}
                      onSave={() => onEventSave?.(e)}
                    />
                  ))}
                </div>
              </section>
            )}

            {bestCafes.length > 0 && (
              <section>
                <SectionHeader title={t("discover.bestCafes")} subtitle={t("discover.bestCafesSubtitle")} />
                <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
                  {bestCafes.map((p, i) => (
                    <PlaceCard
                      key={p.id}
                      place={p}
                      variant="card"
                      index={i}
                      onClick={() => onPlaceClick(p)}
                      onSave={() => onPlaceSave?.(p)}
                    />
                  ))}
                </div>
              </section>
            )}

            {hiddenGems.length > 0 && (
              <section>
                <SectionHeader title={t("discover.hiddenGems")} subtitle={t("discover.hiddenGemsSubtitle")} />
                <div className="grid grid-cols-3 gap-2" data-stagger>
                  {hiddenGems.slice(0, 6).map((p, i) => (
                    <PlaceCard
                      key={p.id}
                      place={p}
                      variant="compact"
                      index={i}
                      onClick={() => onPlaceClick(p)}
                    />
                  ))}
                </div>
              </section>
            )}

            {nearYou.length > 0 && (
              <section>
                <SectionHeader title={t("discover.nearYou")} subtitle={t("discover.nearYouSubtitle")} />
                <div className="space-y-2.5" data-stagger>
                  {nearYou.slice(0, 8).map((item, i) => {
                    const isEvent = "start_time" in item;
                    return (
                      <div key={item.id} className="relative">
                        <span
                          className={`absolute top-3 right-3 text-[9px] font-sans font-semibold px-1.5 py-0.5 rounded z-10 ${
                            isEvent ? "bg-zinc-200 text-zinc-800" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {isEvent ? t("discover.badgeEvent") : t("discover.badgePlace")}
                        </span>
                        {isEvent ? (
                          <EventCard
                            event={item as Event}
                            variant="row"
                            index={i}
                            onClick={() => onEventClick(item as Event)}
                            onSave={() => onEventSave?.(item as Event)}
                          />
                        ) : (
                          <PlaceCard
                            place={item as Place}
                            variant="compact"
                            onClick={() => onPlaceClick(item as Place)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <SearchOverlay
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onApply={(f) => {
          onFiltersApply(f);
          setSearchOpen(false);
        }}
        initialFilters={filters}
      />
    </div>
  );
}
