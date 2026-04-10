"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Place } from "@/types";

export function useSavedPlaceIds() {
  const router = useRouter();
  const supabase = createClient();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        setSavedIds(new Set());
        setReady(true);
        return;
      }
      const { data } = await supabase
        .from("saved_places")
        .select("place_id")
        .eq("user_id", user.id);
      if (cancelled) return;
      setSavedIds(new Set((data ?? []).map((r: { place_id: string }) => r.place_id)));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const toggleSaved = useCallback(
    async (placeId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      if (savedIds.has(placeId)) {
        await supabase
          .from("saved_places")
          .delete()
          .eq("user_id", user.id)
          .eq("place_id", placeId);
        setSavedIds((prev) => {
          const n = new Set(prev);
          n.delete(placeId);
          return n;
        });
      } else {
        await supabase.from("saved_places").insert({
          user_id: user.id,
          place_id: placeId,
        });
        setSavedIds((prev) => new Set(prev).add(placeId));
      }
    },
    [router, savedIds, supabase]
  );

  return { savedIds, toggleSaved, ready };
}

/** Full `paris_places` rows for the current user's saved ids (empty when logged out). */
export function useSavedPlaceRows(savedIds: Set<string>, idsReady: boolean) {
  const supabase = createClient();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(!idsReady);
  const idsKey = useMemo(() => Array.from(savedIds).sort().join(","), [savedIds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!idsReady) {
        setLoading(true);
        return;
      }
      if (savedIds.size === 0) {
        if (!cancelled) {
          setPlaces([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        setPlaces([]);
        setLoading(false);
        return;
      }
      const { data: pls } = await supabase
        .from("paris_places")
        .select("*")
        .in("id", Array.from(savedIds));
      if (!cancelled) {
        setPlaces((pls ?? []) as Place[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey, idsReady, supabase]);

  return { places, loading };
}
