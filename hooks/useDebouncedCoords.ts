"use client";

import { useState, useEffect } from "react";

export function useDebouncedCoords(
  lat: number,
  lng: number,
  delayMs: number
): { lat: number; lng: number } {
  const [debounced, setDebounced] = useState({ lat, lng });

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced({ lat, lng }), delayMs);
    return () => window.clearTimeout(t);
  }, [lat, lng, delayMs]);

  return debounced;
}
