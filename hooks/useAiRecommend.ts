"use client";

import { useCallback, useState } from "react";
import type { RecommendItem, Vibe } from "@/lib/ai/recommendTypes";

export type RecommendSource = "ai" | "cache" | "fallback";

export interface RecommendState {
  items: RecommendItem[];
  message: string;
  source: RecommendSource | null;
  loading: boolean;
  error: string | null;
}

const INITIAL: RecommendState = {
  items: [],
  message: "",
  source: null,
  loading: false,
  error: null,
};

export function useAiRecommend() {
  const [state, setState] = useState<RecommendState>(INITIAL);

  const fetch = useCallback(
    async (
      lat: number,
      lng: number,
      vibe: Vibe | "" = "",
      lang: "en" | "fr" = "en"
    ): Promise<{ items: RecommendItem[]; message: string; source: RecommendSource | null; error: string | null }> => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await window.fetch("/api/ai/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, vibe: vibe || undefined, lang }),
        });

        const data = (await res.json()) as {
          items?: RecommendItem[];
          message?: string;
          source?: RecommendSource;
          limitReason?: string;
        };

        if (res.status === 429) {
          const next: RecommendState = {
            items: [],
            message: data.message ?? "Too many requests — try again soon.",
            source: "fallback",
            loading: false,
            error: null,
          };
          setState(next);
          return { items: next.items, message: next.message, source: next.source, error: next.error };
        }

        if (!res.ok) {
          const errMsg = data.message ?? "Recommendation failed";
          setState((s) => ({
            ...s,
            loading: false,
            error: errMsg,
          }));
          return { items: [], message: "", source: null, error: errMsg };
        }

        const next: RecommendState = {
          items: data.items ?? [],
          message: data.message ?? "",
          source: data.source ?? null,
          loading: false,
          error: null,
        };
        setState(next);
        return { items: next.items, message: next.message, source: next.source, error: next.error };
      } catch {
        const errMsg = "Could not reach recommendation service.";
        setState((s) => ({
          ...s,
          loading: false,
          error: errMsg,
        }));
        return { items: [], message: "", source: null, error: errMsg };
      }
    },
    []
  );

  const setLocal = useCallback((items: RecommendItem[], message: string) => {
    setState({
      items,
      message,
      source: "fallback",
      loading: false,
      error: null,
    });
  }, []);

  const clear = useCallback(() => setState(INITIAL), []);

  return { ...state, fetch, setLocal, clear };
}
