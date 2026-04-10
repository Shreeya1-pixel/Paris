"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Settings, LogOut, ChevronRight, MapPin, Edit3, Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";
import { LanguageToggle } from "@/components/LanguageToggle";
import { CATEGORIES, VIBES, ARRONDISSEMENTS } from "@/lib/constants";
import type { User, Event } from "@/types";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Calendar } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, categoryLabel, vibeLabel, formatEventTime, eventTitle } = useLanguage();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editArr, setEditArr] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [savedEvents, setSavedEvents] = useState<Event[]>([]);
  const [myEvents, setMyEvents] = useState<Event[]>([]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      const { data } = await supabase.from("users").select("*").eq("id", user.id).single();
      if (data) {
        setProfile(data as User);
        setEditName(data.full_name ?? "");
        setEditUsername(data.username ?? "");
        setEditArr(data.arrondissement ?? "");
        setEditAvatar(data.avatar_url ?? "");
      }
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const nowIso = new Date().toISOString();
      const { data: sv } = await supabase.from("saved_events").select("event_id").eq("user_id", user.id);
      const ids = (sv ?? []).map((r: { event_id: string }) => r.event_id);
      if (ids.length) {
        const { data: evs } = await supabase
          .from("events")
          .select("*")
          .in("id", ids)
          .eq("status", "active")
          .gt("start_time", nowIso)
          .order("start_time", { ascending: true });
        setSavedEvents((evs ?? []) as Event[]);
      } else {
        setSavedEvents([]);
      }
      const { data: mine } = await supabase
        .from("events")
        .select("*")
        .eq("created_by", user.id)
        .order("start_time", { ascending: false })
        .limit(40);
      setMyEvents((mine ?? []) as Event[]);
    })();
  }, [profile, supabase]);

  const handleSave = async () => {
    if (!profile) return;
    const avatar = editAvatar.trim() || null;
    await supabase.from("users").update({
      full_name: editName,
      username: editUsername,
      arrondissement: editArr || null,
      avatar_url: avatar,
    }).eq("id", profile.id);
    setProfile((p) =>
      p
        ? {
            ...p,
            full_name: editName,
            username: editUsername,
            arrondissement: editArr,
            avatar_url: avatar,
          }
        : p
    );
    setEditing(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) {
    return (
      <div className="min-h-dvh ow-app-bg flex items-center justify-center pb-nav">
        <div className="w-8 h-8 border-2 border-zinc-800 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const initial = (profile?.full_name ?? profile?.username ?? "P")[0].toUpperCase();

  return (
    <div className="min-h-dvh ow-app-bg pb-nav">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-violet-300/30 blur-[100px]" />
      </div>

      <header className="px-5 pt-12 pb-6">
        <h1 className="font-display text-3xl font-semibold text-zinc-900">{t("profile.title")}</h1>
      </header>

      <main className="px-5 space-y-5">
        {/* Avatar + info */}
        <motion.div className="glass-card p-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-4">
            {profile?.avatar_url && !editing ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="w-16 h-16 rounded-full object-cover shrink-0 shadow-md border border-white/30"
              />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-display font-semibold shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md">
                {initial}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)}
                    placeholder={t("auth.fullName")} className="glass-input w-full h-9 px-3 text-sm" />
                  <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)}
                    placeholder={t("auth.username")} className="glass-input w-full h-9 px-3 text-sm" />
                  <input value={editAvatar} onChange={(e) => setEditAvatar(e.target.value)}
                    placeholder={t("profile.avatarUrl")} className="glass-input w-full h-9 px-3 text-sm" type="url" />
                </div>
              ) : (
                <>
                  <p className="font-display text-xl font-semibold text-[var(--text-primary)]">
                    {profile?.full_name || "@" + (profile?.username ?? "—")}
                  </p>
                  {profile?.username && (
                    <p className="text-sm text-[var(--text-secondary)] mt-0.5">@{profile.username}</p>
                  )}
                  {profile?.arrondissement && (
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> {profile.arrondissement}
                    </p>
                  )}
                </>
              )}
            </div>
            <button type="button"
              onClick={() => {
                if (editing) void handleSave();
                else {
                  setEditAvatar(profile?.avatar_url ?? "");
                  setEditing(true);
                }
              }}
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: editing ? "var(--accent-gold)" : "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: editing ? "var(--bg-base)" : "var(--text-secondary)" }}>
              <Edit3 className="w-4 h-4" />
            </button>
          </div>

          {editing && (
            <div className="mt-3">
              <p className="text-xs font-sans text-[var(--text-muted)] mb-2 uppercase tracking-wide">{t("profile.arrondissement")}</p>
              <div className="flex flex-wrap gap-1.5">
                {ARRONDISSEMENTS.map((arr) => (
                  <button key={arr} type="button"
                    onClick={() => setEditArr(editArr === arr ? "" : arr)}
                    className={cn("h-7 px-2.5 rounded-pill text-xs font-sans border transition-all",
                      editArr === arr
                        ? "bg-[var(--accent-gold)] text-[var(--bg-base)] border-transparent"
                        : "border-[var(--bg-glass-border)] text-[var(--text-secondary)] bg-[var(--bg-glass)]")}>
                    {arr}
                  </button>
                ))}
              </div>
              <button type="button" onClick={handleSave}
                className="mt-3 w-full h-10 rounded-pill text-sm font-sans font-medium"
                style={{ background: "var(--accent-gold)", color: "var(--bg-base)" }}>
                {t("profile.saveChanges")}
              </button>
            </div>
          )}
        </motion.div>

        {/* Interests */}
        {profile?.interests && profile.interests.length > 0 && (
          <motion.div className="glass-card p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <h3 className="font-display text-base font-medium text-[var(--text-primary)] mb-3">{t("profile.interests")}</h3>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((interest) => {
                const cat = CATEGORIES.find((c) => c.id === interest);
                return (
                  <span key={interest} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-sans"
                    style={{ background: cat ? `${cat.color}22` : "var(--bg-glass)", color: cat ? cat.color : "var(--text-secondary)", border: "1px solid var(--bg-glass-border)" }}>
                    {cat?.emoji} {cat ? categoryLabel(cat.id) : interest}
                  </span>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Vibes */}
        {profile?.vibes && profile.vibes.length > 0 && (
          <motion.div className="glass-card p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h3 className="font-display text-base font-medium text-[var(--text-primary)] mb-3">{t("profile.vibe")}</h3>
            <div className="flex flex-wrap gap-2">
              {profile.vibes.map((vibe) => {
                const v = VIBES.find((x) => x.value === vibe);
                return (
                  <span key={vibe} className="px-3 py-1.5 rounded-full text-xs font-sans"
                    style={{ background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", color: "var(--text-secondary)" }}>
                    {v?.emoji} {vibeLabel(vibe)}
                  </span>
                );
              })}
            </div>
          </motion.div>
        )}

        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          <h3 className="font-display text-base font-medium text-[var(--text-primary)] mb-3">
            {t("profile.savedEvents")}
          </h3>
          {savedEvents.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t("profile.noEvents")}</p>
          ) : (
            <ul className="space-y-2">
              {savedEvents.map((e) => (
                <li key={e.id}>
                  <Link
                    href="/map"
                    className="flex items-start gap-2 py-2 border-b border-[var(--border-subtle)] last:border-0"
                  >
                    <Calendar className="w-4 h-4 mt-0.5 text-[var(--accent-gold)] shrink-0" />
                    <div className="min-w-0">
                      <p className="font-sans text-sm text-[var(--text-primary)] truncate">
                        {eventTitle(e)}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatEventTime(e.start_time, e.end_time)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </motion.div>

        <motion.div
          className="glass-card p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
        >
          <h3 className="font-display text-base font-medium text-[var(--text-primary)] mb-3">
            {t("profile.myEvents")}
          </h3>
          {myEvents.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t("profile.noEvents")}</p>
          ) : (
            <ul className="space-y-2">
              {myEvents.map((e) => (
                <li key={e.id}>
                  <Link
                    href="/map"
                    className="flex items-start gap-2 py-2 border-b border-[var(--border-subtle)] last:border-0"
                  >
                    <Calendar className="w-4 h-4 mt-0.5 text-[var(--accent-gold)] shrink-0" />
                    <div className="min-w-0">
                      <p className="font-sans text-sm text-[var(--text-primary)] truncate">
                        {eventTitle(e)}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatEventTime(e.start_time, e.end_time)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </motion.div>

        {/* Actions */}
        <motion.div className="glass-card overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <button type="button" onClick={() => router.push("/onboarding")}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-glass-hover)] transition-colors">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-[var(--accent-gold)]" />
              <span className="font-sans text-sm text-[var(--text-primary)]">{t("profile.updatePrefs")}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
          
          <div
            className="w-full flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]"
          >
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-[var(--accent-gold)]" />
              <span className="font-sans text-sm text-[var(--text-primary)]">{t("profile.language")}</span>
            </div>
            <LanguageToggle layoutId="lang-pill-profile" size="sm" />
          </div>

          <button type="button" onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[var(--bg-glass-hover)] transition-colors">
            <LogOut className="w-5 h-5 text-[var(--accent-red)]" />
            <span className="font-sans text-sm text-[var(--accent-red)]">{t("profile.signOut")}</span>
          </button>
        </motion.div>
      </main>
    </div>
  );
}
