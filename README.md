# paris — city discovery app

A location-aware city guide built with Next.js 14, Mapbox GL, Supabase, and Gemini AI.

## Features

- **Map** — live nearby places (Foursquare), user events, and AI-powered pop-up labels
- **Discover** — feed of upcoming local events sorted by proximity and relevance
- **AI Chat** — Gemini-powered assistant with local knowledge-base fallback
- **AI Recommendations** — vibe-based place/event suggestions with directions
- **Saved** — bookmark events and places; saved items persist across sessions
- **Auth** — email + Google OAuth via Supabase

## Tech stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14 (App Router) |
| Map | Mapbox GL JS + react-map-gl |
| Database / Auth | Supabase (Postgres + RLS) |
| AI | Google Gemini 1.5 Flash |
| Places | Foursquare Places API v3 |
| Styling | Tailwind CSS + Framer Motion |
| State | TanStack Query |

## Getting started

### 1. Clone and install

```bash
git clone <repo-url> paris
cd paris
npm install
```

### 2. Environment variables

Copy the example and fill in your keys:

```bash
cp .env.local.example .env.local
```

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (server-only) |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | [mapbox.com](https://account.mapbox.com/access-tokens/) |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) |
| `FOURSQUARE_API_KEY` | [Foursquare Developer](https://developer.foursquare.com/) |

### 3. Supabase setup

See `SUPABASE_SETUP.md` for full instructions (tables, RLS, auth providers).

Quick version:
```bash
# In your Supabase SQL editor, run:
supabase/schema.sql

# Then seed the curated Paris places:
npm run seed:paris
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Tip:** Use Chrome DevTools → Sensors → Location and set `48.8566, 2.3522` to simulate a Paris GPS position.

## Deployment (Vercel)

1. Push the repo to GitHub.
2. Import into [vercel.com/new](https://vercel.com/new).
3. Add all environment variables from `.env.local.example` in the Vercel dashboard.
4. In your Supabase Auth settings, add your Vercel production URL to **Redirect URLs**.
5. Deploy — Vercel auto-detects Next.js.

The `vercel.json` in this repo pins the deployment region to `cdg1` (Paris) and configures CORS headers for API routes.

## Project structure

```
app/
  (app)/          — authenticated app routes (map, discover, saved, profile)
  api/            — Next.js route handlers
  auth/           — login / signup / OAuth callback
components/
  map/            — MapView, labels, AI panel, chat bar
  discover/       — event/place cards, detail sheets
  ui/             — shared primitives
hooks/            — useUserLocation, usePlaces, useSavedEvents, …
lib/
  ai/             — rate limits, cache, types
  data/           — static Paris place catalog (KB fallback)
  feed/           — event scoring and feed cache
  supabase/       — client, server, admin helpers
utils/
  mapHelpers.ts   — clustering, trending score, category mapping
types/index.ts    — shared TypeScript types
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm run seed:paris` | Seed curated Paris places into Supabase |
