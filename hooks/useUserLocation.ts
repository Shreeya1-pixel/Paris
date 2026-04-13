"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type LocationStatus = "pending" | "granted" | "denied" | "unavailable" | "error";

export interface UserCoords {
  lat: number;
  lng: number;
}

const DEBOUNCE_MS = 5000;

function isLockStolenAbort(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const maybe = err as { name?: string; message?: string };
  return (
    maybe.name === "AbortError" &&
    typeof maybe.message === "string" &&
    maybe.message.toLowerCase().includes("lock was stolen")
  );
}

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
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyPosition(pos.coords.latitude, pos.coords.longitude, "granted");
        },
        (err) => {
          // Safari/WebKit throws "Lock was stolen" as a POSITION_UNAVAILABLE error
          if (
            err.message?.toLowerCase().includes("lock was stolen") ||
            err.message?.toLowerCase().includes("aborted")
          ) {
            setLoading(false);
            return;
          }
          const denied = err.code === err.PERMISSION_DENIED;
          setStatus(denied ? "denied" : "error");
          setError(err.message || (denied ? "Permission denied" : "Unable to detect location"));
          setLoading(false);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 }
      );
    } catch (err) {
      if (isLockStolenAbort(err)) {
        setLoading(false);
        return;
      }
      const msg = err instanceof Error ? err.message : "Unable to detect location";
      setStatus("error");
      setError(msg);
      setLoading(false);
    }
  }, [applyPosition]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!watch || typeof navigator === "undefined" || !navigator.geolocation) return;

    let id: number | null = null;
    try {
      id = navigator.geolocation.watchPosition(
        (pos) => {
          if (watchTimer.current) clearTimeout(watchTimer.current);
          watchTimer.current = setTimeout(() => {
            applyPosition(pos.coords.latitude, pos.coords.longitude, "granted");
          }, DEBOUNCE_MS);
        },
        (err) => {
          if (
            err.code === err.POSITION_UNAVAILABLE &&
            err.message?.toLowerCase().includes("lock was stolen")
          ) {
            return;
          }
          setError(err.message || "Unable to track location");
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
      );
    } catch (err) {
      if (isLockStolenAbort(err)) return;
      const msg = err instanceof Error ? err.message : "Unable to track location";
      setError(msg);
      return;
    }

    return () => {
      if (id != null) navigator.geolocation.clearWatch(id);
      if (watchTimer.current) clearTimeout(watchTimer.current);
    };
  }, [watch, applyPosition]);

  const coords: UserCoords = {
    lat: lat ?? 0,
    lng: lng ?? 0,
  };

  return { lat, lng, coords, loading, error, status, refresh };
}
