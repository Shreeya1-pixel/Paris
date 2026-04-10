"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PARIS_CENTER } from "@/lib/geo";

export type LocationStatus = "pending" | "granted" | "denied" | "unavailable" | "error";

export interface UserCoords {
  lat: number;
  lng: number;
}

const DEBOUNCE_MS = 5000;

export function useUserLocation(options?: { watch?: boolean }) {
  const watch = options?.watch ?? false;
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LocationStatus>("pending");
  const watchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyPosition = useCallback((latitude: number, longitude: number, nextStatus: LocationStatus) => {
    setLat(latitude);
    setLng(longitude);
    setStatus(nextStatus);
    setError(null);
    setLoading(false);
    // eslint-disable-next-line no-console
    console.log("User location:", latitude, longitude);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      setLoading(false);
      setError("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPosition(pos.coords.latitude, pos.coords.longitude, "granted");
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setStatus(denied ? "denied" : "error");
        setError(err.message || (denied ? "Permission denied" : "Unable to detect location"));
        setLoading(false);
        // Fallback only when permission is denied.
        if (denied) {
          setLat(PARIS_CENTER.lat);
          setLng(PARIS_CENTER.lng);
          // eslint-disable-next-line no-console
          console.log("User location:", PARIS_CENTER.lat, PARIS_CENTER.lng);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 }
    );
  }, [applyPosition]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!watch || typeof navigator === "undefined" || !navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (watchTimer.current) clearTimeout(watchTimer.current);
        watchTimer.current = setTimeout(() => {
          applyPosition(pos.coords.latitude, pos.coords.longitude, "granted");
        }, DEBOUNCE_MS);
      },
      (err) => {
        setError(err.message || "Unable to track location");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
    );

    return () => {
      navigator.geolocation.clearWatch(id);
      if (watchTimer.current) clearTimeout(watchTimer.current);
    };
  }, [watch, applyPosition]);

  const coords: UserCoords = {
    lat: lat ?? PARIS_CENTER.lat,
    lng: lng ?? PARIS_CENTER.lng,
  };

  return { lat, lng, coords, loading, error, status, refresh };
}
