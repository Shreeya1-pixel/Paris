import { NextRequest, NextResponse } from "next/server";
import { haversineKm } from "@/lib/geo";
import type { Event, ParisCategory } from "@/types";

export const dynamic = "force-dynamic";

const MAX_SIZE = 24;
// Only show events within this radius — filters out corrupt TM coordinates and events in other cities
const MAX_DISTANCE_KM = 320; // ~200 miles
const MIN_RESULTS_TARGET = 3;

function tmCategory(segment?: string): ParisCategory {
  const s = (segment ?? "").toLowerCase();
  if (s.includes("music") || s.includes("concert")) return "music";
  if (s.includes("sport")) return "sport";
  if (s.includes("arts") || s.includes("theatre") || s.includes("theater")) return "culture";
  return "culture";
}

async function fetchTicketmasterAtRadius(lat: number, lng: number, radiusMiles: number): Promise<Event[]> {
  const key = process.env.TICKETMASTER_API_KEY?.trim();
  if (!key) return [];

  const start = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", key);
  url.searchParams.set("latlong", `${lat},${lng}`);
  url.searchParams.set("radius", String(radiusMiles));
  url.searchParams.set("unit", "miles");
  url.searchParams.set("startDateTime", start);
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("size", String(MAX_SIZE));

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[ticketmaster] HTTP", res.status, errText.slice(0, 300));
    return [];
  }

  const data = (await res.json()) as {
    _embedded?: {
      events?: {
        id: string;
        name?: string;
        url?: string;
        images?: { url?: string }[];
        dates?: { start?: { dateTime?: string; localDate?: string } };
        classifications?: { segment?: { name?: string } }[];
        _embedded?: {
          venues?: {
            name?: string;
            location?: { latitude?: string; longitude?: string };
            address?: { line1?: string };
          }[];
        };
      }[];
    };
  };

  const out: Event[] = [];
  let approximateIdx = 0;
  for (const ev of data._embedded?.events ?? []) {
    const venue = ev._embedded?.venues?.[0];
    const rawLat = venue?.location?.latitude != null ? Number(venue.location.latitude) : NaN;
    const rawLng = venue?.location?.longitude != null ? Number(venue.location.longitude) : NaN;
    const hasVenueCoords = Number.isFinite(rawLat) && Number.isFinite(rawLng);
    const vLat = hasVenueCoords ? rawLat : lat + (approximateIdx % 6) * 0.00025;
    const vLng = hasVenueCoords ? rawLng : lng + (Math.floor(approximateIdx / 6) % 6) * 0.00025;
    approximateIdx++;
    const d = haversineKm(lat, lng, vLat, vLng);
    const seg = ev.classifications?.[0]?.segment?.name;
    const startIso = ev.dates?.start?.dateTime ?? `${ev.dates?.start?.localDate ?? ""}T12:00:00Z`;

    out.push({
      id: `tm-${ev.id}`,
      created_by: "live-feed",
      title: ev.name ?? "Live event",
      description: null,
      category: tmCategory(seg),
      vibe_tags: [],
      start_time: startIso,
      end_time: null,
      location_name: venue?.name ?? null,
      arrondissement: null,
      address: venue?.address?.line1 ?? null,
      lat: vLat,
      lng: vLng,
      image_url:
        ev.images?.find((im) => (im.url ?? "").includes("RETINA_PORTRAIT"))?.url ??
        ev.images?.[0]?.url ??
        null,
      ticket_url: ev.url ?? null,
      is_free: false,
      price: null,
      max_attendees: null,
      attendee_count: 0,
      source: "curated",
      status: "active",
      created_at: new Date().toISOString(),
      distance_km: d,
    });
  }
  return out;
}

async function fetchTicketmaster(lat: number, lng: number): Promise<Event[]> {
  // Expand search radius progressively until we have results or exhaust all radii.
  // Hard cap: only keep events within MAX_DISTANCE_KM to ensure same-city relevance
  // and to reject events with corrupted/sign-flipped coordinates in Ticketmaster's DB.
  const radii = [10, 30, 60, 120, 200];
  const byId = new Map<string, Event>();
  for (const radius of radii) {
    const batch = await fetchTicketmasterAtRadius(lat, lng, radius);
    for (const ev of batch) {
      if (!byId.has(ev.id) && (ev.distance_km ?? 1e9) <= MAX_DISTANCE_KM) {
        byId.set(ev.id, ev);
      }
    }
    if (byId.size >= MIN_RESULTS_TARGET) break;
  }
  // Return only genuinely nearby events — no global fallback to avoid
  // pulling in far-away events or those with bad coordinates.
  return Array.from(byId.values())
    .sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9))
    .slice(0, MAX_SIZE);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Invalid lat/lng", events: [] }, { status: 400 });
  }

  const tmKey = process.env.TICKETMASTER_API_KEY?.trim();
  const hasTm = Boolean(tmKey);
  console.log("[discover/live] TICKETMASTER_API_KEY present:", hasTm, "lat:", lat, "lng:", lng);

  if (!hasTm) {
    return NextResponse.json({
      events: [] as Event[],
      configured: false,
      message: "Add TICKETMASTER_API_KEY on the server.",
    });
  }

  const events = (await fetchTicketmaster(lat, lng)).sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  return NextResponse.json({
    events: events.slice(0, 24),
    configured: true,
    source: "ticketmaster",
    count: events.length,
  });
}
