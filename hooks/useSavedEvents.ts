"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function useSavedEventIds() {
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
        .from("saved_events")
        .select("event_id")
        .eq("user_id", user.id);
      if (cancelled) return;
      setSavedIds(new Set((data ?? []).map((r: { event_id: string }) => r.event_id)));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const toggleSaved = useCallback(
    async (eventId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      if (savedIds.has(eventId)) {
        await supabase
          .from("saved_events")
          .delete()
          .eq("user_id", user.id)
          .eq("event_id", eventId);
        setSavedIds((prev) => {
          const n = new Set(prev);
          n.delete(eventId);
          return n;
        });
      } else {
        await supabase.from("saved_events").insert({
          user_id: user.id,
          event_id: eventId,
        });
        setSavedIds((prev) => new Set(prev).add(eventId));
      }
    },
    [router, savedIds, supabase]
  );

  return { savedIds, toggleSaved, ready };
}
