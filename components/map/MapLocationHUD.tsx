"use client";

import type { LocationStatus } from "@/hooks/useUserLocation";

interface MapLocationHUDProps {
  status: LocationStatus;
  lat: number;
  lng: number;
  /** Live tracking (watch) on — show hint */
  tracking?: boolean;
}

export function MapLocationHUD({ status, lat, lng, tracking }: MapLocationHUDProps) {
  const showBanner = status === "pending" || status === "denied" || status === "error" || status === "unavailable";

  return (
    <>
      {showBanner && (
        <div className="absolute left-3 right-3 z-30 pointer-events-none flex justify-center"
          style={{ top: "calc(max(48px, env(safe-area-inset-top, 0px)) + 52px)" }}>
          <div
            className="max-w-md px-3 py-2 rounded-2xl text-xs font-sans text-center shadow-lg border border-white/30
              bg-white/85 backdrop-blur-md text-zinc-800"
          >
            {status === "pending" && <span>Detecting your location…</span>}
            {(status === "denied" || status === "error" || status === "unavailable") && (
              <span>Location access unavailable — showing Paris center for discovery.</span>
            )}
          </div>
        </div>
      )}

      {process.env.NODE_ENV === "development" && (
        <div className="absolute left-2 z-30 max-w-[200px] pointer-events-none"
          style={{ top: "calc(max(48px, env(safe-area-inset-top, 0px)) + 100px)" }}>
          <div className="px-2 py-1.5 rounded-lg text-[10px] font-mono leading-tight bg-black/70 text-emerald-300/95 backdrop-blur-sm border border-white/10">
            <div className="text-white/50 mb-0.5">dev · coords</div>
            <div>
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </div>
            <div className="text-white/40 mt-0.5">{status}{tracking ? " · watch" : ""}</div>
          </div>
        </div>
      )}
    </>
  );
}
