"use client";

import { useCallback } from "react";
import MapGL, { Marker, type MapMouseEvent } from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { PARIS_CENTER } from "@/lib/constants";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

const PARIS_BOUNDS: [[number, number], [number, number]] = [
  [2.2241, 48.8156],
  [2.4699, 48.9021],
];

interface MapLocationPickerProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}

export function MapLocationPicker({ lat, lng, onChange }: MapLocationPickerProps) {
  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      onChange(e.lngLat.lat, e.lngLat.lng);
    },
    [onChange]
  );

  if (!TOKEN.trim()) {
    return (
      <p className="text-xs text-zinc-500 px-1">
        Set <code className="bg-zinc-100 px-1 rounded">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to pick a
        location on the map.
      </p>
    );
  }

  return (
    <div className="h-56 w-full rounded-2xl overflow-hidden border border-zinc-200 shadow-inner">
      <MapGL
        mapLib={mapboxgl}
        mapboxAccessToken={TOKEN}
        initialViewState={{
          longitude: lng || PARIS_CENTER.lng,
          latitude: lat || PARIS_CENTER.lat,
          zoom: 14,
        }}
        onClick={handleClick}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        maxBounds={PARIS_BOUNDS}
        minZoom={11}
        maxZoom={18}
      >
        <Marker longitude={lng} latitude={lat} anchor="bottom">
          <div className="w-4 h-4 rounded-full bg-zinc-900 border-2 border-white shadow-md" />
        </Marker>
      </MapGL>
    </div>
  );
}
