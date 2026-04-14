"use client";

import { useState, useMemo, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  UtensilsCrossed,
  Coffee,
  Music,
  Wine,
  Sparkles,
  Moon,
  Palette,
  Landmark,
  TreePine,
  ShoppingBag,
  Dumbbell,
  Plus,
  X,
} from "lucide-react";
import { CATEGORIES, PARIS_CENTER, ARRONDISSEMENTS } from "@/lib/constants";
import { MapLocationPicker } from "@/components/map/MapLocationPicker";
import { isWithinParisRegion } from "@/lib/geo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { ParisCategory } from "@/types";
import { useLanguage } from "@/components/LanguageProvider";
import { LanguageToggle } from "@/components/LanguageToggle";

const categoryIcon = (id: ParisCategory) => {
  const map: Record<ParisCategory, React.ReactNode> = {
    cafe: <Coffee className="w-4 h-4" />,
    food: <UtensilsCrossed className="w-4 h-4" />,
    bar: <Wine className="w-4 h-4" />,
    nightlife: <Moon className="w-4 h-4" />,
    music: <Music className="w-4 h-4" />,
    art: <Palette className="w-4 h-4" />,
    culture: <Landmark className="w-4 h-4" />,
    outdoor: <TreePine className="w-4 h-4" />,
    market: <ShoppingBag className="w-4 h-4" />,
    sport: <Dumbbell className="w-4 h-4" />,
    "pop-up": <Sparkles className="w-4 h-4" />,
  };
  return map[id];
};

type FormData = {
  title: string;
  title_alt: string;
  category: string;
  description: string;
  description_alt: string;
  start_date: string;
  start_time: string;
  end_time: string;
  location_name: string;
  arrondissement: string;
  capacity: string;
  price?: number;
  ticket_url: string;
  image_url: string;
  min_age: string;
};

export default function CreateEventPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = createClient();
  const { t, lang, categoryLabel } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [selectedCat, setSelectedCat] = useState<ParisCategory | "">("");
  const [ticketFree, setTicketFree] = useState(true);
  const [gender, setGender] = useState<"male" | "female" | "none">("none");
  const [pickerLat, setPickerLat] = useState(PARIS_CENTER.lat);
  const [pickerLng, setPickerLng] = useState(PARIS_CENTER.lng);
  const [imagePreview, setImagePreview] = useState("");
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const schema = useMemo(
    () =>
      z
        .object({
          title: z.string().min(3, t("validation.titleMin")).max(80, t("validation.titleMax")),
          title_alt: z.string().max(80),
          category: z.string().min(1, t("validation.category")),
          description: z.string().max(500),
          description_alt: z.string().max(500),
          start_date: z.string().min(1, t("validation.date")),
          start_time: z.string().min(1, t("validation.time")),
          end_time: z.string(),
          location_name: z.string().min(2, t("validation.location")),
          arrondissement: z.string().min(1, t("validation.arrondissement")),
          capacity: z.string(),
          price: z.number().nonnegative().optional(),
          ticket_url: z.string().refine((s) => !s || /^https?:\/\//.test(s), t("validation.url")),
          image_url: z.string().refine(
            (s) => !s || /^https?:\/\//.test(s) || /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(s),
            t("validation.url")
          ),
          min_age: z.string(),
        })
        .refine(
          (data) => {
            const start = new Date(`${data.start_date}T${data.start_time}`);
            return !Number.isNaN(start.getTime()) && start > new Date();
          },
          { message: t("validation.future"), path: ["start_time"] }
        ),
    [t]
  );

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      title_alt: "",
      category: "",
      description: "",
      description_alt: "",
      start_date: "",
      start_time: "",
      end_time: "",
      location_name: "",
      arrondissement: "",
      capacity: "",
      ticket_url: "",
      image_url: "",
      min_age: "",
    },
  });

  const setFree = (free: boolean) => setTicketFree(free);

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPublishError("Please choose an image file.");
      e.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPublishError("Image must be under 2 MB.");
      e.target.value = "";
      return;
    }
    setPublishError("");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl.startsWith("data:image/")) {
        setPublishError("Could not read image. Try another file.");
        return;
      }
      setImagePreview(dataUrl);
      setValue("image_url", dataUrl, { shouldValidate: true, shouldDirty: true });
    };
    reader.onerror = () => setPublishError("Could not read image. Try another file.");
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImagePreview("");
    setValue("image_url", "", { shouldValidate: true, shouldDirty: true });
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    setPublishError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/auth/login");
      setSaving(false);
      return;
    }
    if (!isWithinParisRegion(pickerLat, pickerLng)) {
      setPublishError(t("validation.parisBounds"));
      setSaving(false);
      return;
    }

    const startTime = new Date(`${data.start_date}T${data.start_time}`).toISOString();
    const endTime = data.end_time
      ? new Date(`${data.start_date}T${data.end_time}`).toISOString()
      : null;
    const otherLang = lang === "en" ? "fr" : "en";
    const title_i18n: Record<string, string> = {};
    if (data.title_alt?.trim()) title_i18n[otherLang] = data.title_alt.trim();
    const description_i18n: Record<string, string> = {};
    if (data.description_alt?.trim())
      description_i18n[otherLang] = data.description_alt.trim();

    const { error } = await supabase.from("events").insert({
      created_by: user.id,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      title_i18n: Object.keys(title_i18n).length ? title_i18n : {},
      description_i18n: Object.keys(description_i18n).length ? description_i18n : {},
      category: data.category,
      vibe_tags: [] as string[],
      start_time: startTime,
      end_time: endTime,
      location_name: data.location_name,
      arrondissement: data.arrondissement,
      address: data.location_name,
      lat: pickerLat,
      lng: pickerLng,
      image_url: data.image_url ?? null,
      ticket_url: data.ticket_url ?? null,
      is_free: ticketFree,
      price: ticketFree ? null : data.price ?? null,
      max_attendees:
        data.capacity && data.capacity.trim() !== ""
          ? parseInt(data.capacity, 10)
          : null,
      source: "user",
      status: "active",
    });
    setSaving(false);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[CreateEvent] insert failed:", error);
      setPublishError(t("create.publishFailed"));
      return;
    }
    // eslint-disable-next-line no-console
    console.log("[CreateEvent] created:", { startTime, lat: pickerLat, lng: pickerLng });
    void queryClient.invalidateQueries({
      predicate: (q) =>
        ["discover", "feed", "eventsNearby", "nearby", "search", "events"].includes(
          String(q.queryKey[0] ?? "")
        ),
    });
    router.push(
      `/discover?lat=${encodeURIComponent(String(pickerLat))}&lng=${encodeURIComponent(
        String(pickerLng)
      )}&fresh=1`
    );
    router.refresh();
  };

  const inputRightIcon = (node: React.ReactNode) => (
    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
      {node}
    </span>
  );

  return (
    <div className="min-h-dvh relative overflow-x-hidden pb-36">
      <div className="fixed inset-0 ow-app-bg" />
      <div className="fixed inset-0 bg-gradient-to-br from-fuchsia-200/50 via-indigo-200/35 to-amber-100/45 pointer-events-none" />

      <header className="relative z-20 flex items-center justify-between gap-3 px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-11 h-11 rounded-full bg-white/50 backdrop-blur-md border border-white/60 flex items-center justify-center text-zinc-800 shadow-sm active:scale-95 transition-transform shrink-0"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display text-2xl font-semibold text-zinc-900 truncate">
            {t("create.pageTitle")}
          </h1>
        </div>
        <LanguageToggle layoutId="lang-pill-create" size="sm" className="shrink-0" />
      </header>

      <main className="relative z-10 px-4 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="ow-glass-panel p-5 sm:p-6 space-y-6 max-w-lg mx-auto"
        >
          <div>
            <input
              {...register("title")}
              placeholder={t("create.eventTitlePh")}
              className="w-full text-2xl font-semibold text-zinc-900 placeholder:text-zinc-400 bg-transparent border-none outline-none"
            />
            {errors.title && (
              <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>
            )}
          </div>

          <div>
            <p className="text-sm font-bold text-zinc-700 mb-3">{t("create.selectType")}</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => {
                const active = selectedCat === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCat(cat.id);
                      setValue("category", cat.id);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border transition-all",
                      active
                        ? "bg-zinc-900 text-white border-zinc-900 shadow-md"
                        : "bg-white/55 text-zinc-600 border-white/70 hover:bg-white/75"
                    )}
                  >
                    {categoryIcon(cat.id)}
                    {categoryLabel(cat.id)}
                  </button>
                );
              })}
            </div>
            {errors.category && (
              <p className="text-xs text-red-500 mt-1">{errors.category.message}</p>
            )}
            <input type="hidden" {...register("category")} />
          </div>

          <div>
            <label className="text-sm font-bold text-zinc-700">{t("create.descLabel")}</label>
            <textarea
              {...register("description")}
              rows={4}
              placeholder={t("create.descPh")}
              className="mt-2 ow-glass-input w-full px-4 py-3 text-sm resize-none min-h-[120px]"
            />
          </div>

          <div>
            <label className="text-sm font-bold text-zinc-700 block mb-2">
              {lang === "en" ? t("create.titleAlt") : t("create.titleAltFr")}
            </label>
            <input
              {...register("title_alt")}
              className="ow-glass-input w-full h-12 px-4 text-sm"
              placeholder={t("create.titleAltPh")}
            />
          </div>

          <div>
            <label className="text-sm font-bold text-zinc-700 block mb-2">
              {lang === "en" ? t("create.descAlt") : t("create.descAltFr")}
            </label>
            <textarea
              {...register("description_alt")}
              rows={3}
              placeholder={t("create.descAltPh")}
              className="ow-glass-input w-full px-4 py-3 text-sm resize-none"
            />
          </div>

          <div>
            <p className="text-sm font-bold text-zinc-700 mb-3">{t("create.dateTime")}</p>
            <div className="relative mb-3">
              <input
                {...register("start_date")}
                type="date"
                className="ow-glass-input w-full h-12 px-4 pr-11 text-sm"
              />
              {inputRightIcon(<Calendar className="w-4 h-4" />)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <input
                  {...register("start_time")}
                  type="time"
                  className="ow-glass-input w-full h-12 px-4 pr-11 text-sm"
                />
                {inputRightIcon(<Clock className="w-4 h-4" />)}
              </div>
              <div className="relative">
                <input
                  {...register("end_time")}
                  type="time"
                  className="ow-glass-input w-full h-12 px-4 pr-11 text-sm"
                />
                {inputRightIcon(<Clock className="w-4 h-4" />)}
              </div>
            </div>
            {(errors.start_date || errors.start_time) && (
              <p className="text-xs text-red-500 mt-1">
                {t("validation.date")} · {t("validation.time")}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-bold text-zinc-700">{t("create.location")}</label>
            <div className="relative mt-2">
              <input
                {...register("location_name")}
                placeholder={t("create.locationPh")}
                className="ow-glass-input w-full h-12 px-4 pr-11 text-sm"
              />
              {inputRightIcon(<MapPin className="w-4 h-4" />)}
            </div>
            {errors.location_name && (
              <p className="text-xs text-red-500 mt-1">{errors.location_name.message}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-bold text-zinc-700 block mb-2">
              {t("profile.arrondissement")}
            </label>
            <select
              {...register("arrondissement")}
              className="ow-glass-input w-full h-12 px-4 text-sm bg-white/80"
            >
              <option value="">{t("validation.arrondissement")}</option>
              {ARRONDISSEMENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            {errors.arrondissement && (
              <p className="text-xs text-red-500 mt-1">{errors.arrondissement.message}</p>
            )}
          </div>

          <div>
            <p className="text-sm font-bold text-zinc-700 mb-2">{t("create.pinOnMap")}</p>
            <MapLocationPicker
              lat={pickerLat}
              lng={pickerLng}
              onChange={(lat, lng) => {
                setPickerLat(lat);
                setPickerLng(lng);
              }}
            />
            <p className="text-xs text-zinc-500 mt-2">{t("create.pinHint")}</p>
          </div>

          <div>
            <label className="text-sm font-bold text-zinc-700">{t("create.capacity")}</label>
            <input
              {...register("capacity")}
              inputMode="numeric"
              placeholder={t("create.capacityPh")}
              className="mt-2 ow-glass-input w-full h-12 px-4 text-sm"
            />
          </div>

          <div>
            <p className="text-sm font-bold text-zinc-700 mb-2">{t("create.ticketType")}</p>
            <div className="flex rounded-full p-1 bg-white/50 border border-white/60">
              <button
                type="button"
                onClick={() => setFree(false)}
                className={cn(
                  "flex-1 py-2.5 rounded-full text-sm font-bold transition-all",
                  !ticketFree ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-500"
                )}
              >
                {t("create.paid")}
              </button>
              <button
                type="button"
                onClick={() => setFree(true)}
                className={cn(
                  "flex-1 py-2.5 rounded-full text-sm font-bold transition-all",
                  ticketFree ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-500"
                )}
              >
                {t("create.free")}
              </button>
            </div>
            {!ticketFree && (
              <div className="mt-3 space-y-2">
                <input
                  {...register("price", {
                    setValueAs: (v) => {
                      if (v === "" || v == null) return undefined;
                      const n = typeof v === "number" ? v : Number(v);
                      return Number.isFinite(n) ? n : undefined;
                    },
                  })}
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder={t("create.pricePh")}
                  className="ow-glass-input w-full h-12 px-4 text-sm"
                />
                <input
                  {...register("ticket_url")}
                  type="url"
                  placeholder={t("create.ticketUrlPh")}
                  className="ow-glass-input w-full h-12 px-4 text-sm"
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-bold text-zinc-700">{t("create.ageOpt")}</label>
            <input
              {...register("min_age")}
              type="number"
              min={0}
              placeholder={t("create.agePh")}
              className="mt-2 ow-glass-input w-full h-12 px-4 text-sm"
            />
          </div>

          <div>
            <p className="text-sm font-bold text-zinc-700 mb-2">{t("create.genderOpt")}</p>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  { k: "male" as const, label: t("create.genderMale") },
                  { k: "female" as const, label: t("create.genderFemale") },
                  { k: "none" as const, label: t("create.genderNone") },
                ]
              ).map(({ k, label }) => (
                <label key={k} className="inline-flex items-center gap-2 cursor-pointer">
                  <span
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                      gender === k ? "border-zinc-900" : "border-zinc-300"
                    )}
                  >
                    {gender === k && <span className="w-2.5 h-2.5 rounded-full bg-zinc-900" />}
                  </span>
                  <input
                    type="radio"
                    name="gender"
                    className="sr-only"
                    checked={gender === k}
                    onChange={() => setGender(k)}
                  />
                  <span className="text-sm font-medium text-zinc-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-zinc-700">{t("create.imageOpt")}</label>
            <input type="hidden" {...register("image_url")} />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            {!imagePreview ? (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="mt-2 w-full h-28 rounded-2xl border border-dashed border-zinc-300 bg-white/55 hover:bg-white/75 transition-colors flex flex-col items-center justify-center text-zinc-600"
              >
                <Plus className="w-6 h-6 mb-1.5" />
                <span className="text-sm font-medium">Add image</span>
              </button>
            ) : (
              <div className="mt-2 relative rounded-2xl overflow-hidden border border-zinc-200 bg-white/55">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Event cover preview" className="w-full h-40 object-cover" />
                <div className="absolute top-2 right-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="w-9 h-9 rounded-full bg-black/70 text-white flex items-center justify-center"
                    aria-label="Replace image"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={clearImage}
                    className="w-9 h-9 rounded-full bg-black/70 text-white flex items-center justify-center"
                    aria-label="Remove image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-zinc-500">{t("create.noteReq")}</p>
          {publishError && (
            <p className="text-xs text-red-500 text-center">{publishError}</p>
          )}
        </motion.div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-[calc(72px+env(safe-area-inset-bottom,0px))] pt-4 bg-gradient-to-t from-white/90 via-white/70 to-transparent pointer-events-none">
        <button
          type="button"
          disabled={saving}
          onClick={handleSubmit(onSubmit)}
          className="pointer-events-auto w-full max-w-lg mx-auto block h-14 rounded-2xl bg-zinc-900 text-white text-sm font-bold tracking-wide shadow-xl active:scale-[0.99] transition-transform disabled:opacity-50"
        >
          {saving ? t("create.publishingBtn") : t("create.createBtn")}
        </button>
      </div>
    </div>
  );
}
