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
    ) => {
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
          setState({
            items: [],
            message: data.message ?? "Too many requests — try again soon.",
            source: "fallback",
            loading: false,
            error: null,
          });
          return;
        }

        if (!res.ok) {
          setState((s) => ({
            ...s,
            loading: false,
            error: data.message ?? "Recommendation failed",
          }));
          return;
        }

        setState({
          items: data.items ?? [],
          message: data.message ?? "",
          source: data.source ?? null,
          loading: false,
          error: null,
        });
      } catch {
        setState((s) => ({
          ...s,
          loading: false,
          error: "Could not reach recommendation service.",
        }));
      }
    },
    []
  );

  const clear = useCallback(() => setState(INITIAL), []);

  return { ...state, fetch, clear };
}
