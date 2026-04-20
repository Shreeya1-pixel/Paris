 -- Openworld Paris: Full schema
-- Run this in Supabase SQL Editor

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT UNIQUE NOT NULL,
  full_name       TEXT,
  avatar_url      TEXT,
  vibes           TEXT[] DEFAULT '{}',
  interests       TEXT[] DEFAULT '{}',
  arrondissement  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Events ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  title_i18n      JSONB DEFAULT '{}'::jsonb,
  description_i18n JSONB DEFAULT '{}'::jsonb,
  category        TEXT NOT NULL,
  vibe_tags       TEXT[] DEFAULT '{}',
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ,
  location_name   TEXT,
  arrondissement  TEXT,
  address         TEXT,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  image_url       TEXT,
  ticket_url      TEXT,
  is_free         BOOLEAN DEFAULT true,
  price           NUMERIC(10,2),
  max_attendees   INT,
  attendee_count  INT DEFAULT 0,
  source          TEXT DEFAULT 'user',
  status          TEXT DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_lat_lng       ON public.events(lat, lng);
CREATE INDEX IF NOT EXISTS idx_events_start_time    ON public.events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_category      ON public.events(category);
CREATE INDEX IF NOT EXISTS idx_events_arrondissement ON public.events(arrondissement);
CREATE INDEX IF NOT EXISTS idx_events_status        ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_created_by    ON public.events(created_by);

-- ─── Paris Places (curated) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paris_places (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  description     TEXT,
  address         TEXT NOT NULL,
  arrondissement  TEXT NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  image_url       TEXT,
  tags            TEXT[] DEFAULT '{}',
  opening_hours   JSONB,
  price_range     TEXT,
  website_url     TEXT,
  instagram_url   TEXT,
  is_featured     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_places_lat_lng       ON public.paris_places(lat, lng);
CREATE INDEX IF NOT EXISTS idx_places_category      ON public.paris_places(category);
CREATE INDEX IF NOT EXISTS idx_places_arrondissement ON public.paris_places(arrondissement);
CREATE INDEX IF NOT EXISTS idx_places_is_featured   ON public.paris_places(is_featured);

-- ─── Saved Events ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_events (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id  UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  saved_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_events_user ON public.saved_events(user_id);

-- ─── Saved Places ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_places (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  place_id  UUID NOT NULL REFERENCES public.paris_places(id) ON DELETE CASCADE,
  saved_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_places_user ON public.saved_places(user_id);

-- ─── Event Attendees ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_attendees (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id  UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON public.event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user  ON public.event_attendees(user_id);

-- ─── Upgrade Interest Clicks ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.upgrade_interest (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email       TEXT UNIQUE NOT NULL,
  source      TEXT NOT NULL DEFAULT 'chatbot_limit',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upgrade_interest_created_at ON public.upgrade_interest(created_at);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paris_places    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_places    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upgrade_interest ENABLE ROW LEVEL SECURITY;

-- users
CREATE POLICY "Users are viewable by everyone"   ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"     ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"     ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- events
CREATE POLICY "Active events are viewable by everyone" ON public.events
  FOR SELECT USING (status = 'active');
CREATE POLICY "Auth users can create events" ON public.events
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update own events" ON public.events
  FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete own events" ON public.events
  FOR DELETE USING (auth.uid() = created_by);

-- paris_places (read-only for public)
CREATE POLICY "Paris places are viewable by everyone" ON public.paris_places
  FOR SELECT USING (true);

-- saved_events
CREATE POLICY "Users can view own saved events"   ON public.saved_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own saved events" ON public.saved_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved events" ON public.saved_events FOR DELETE USING (auth.uid() = user_id);

-- saved_places
CREATE POLICY "Users can view own saved places"   ON public.saved_places FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own saved places" ON public.saved_places FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved places" ON public.saved_places FOR DELETE USING (auth.uid() = user_id);

-- event_attendees
CREATE POLICY "Attendees viewable by everyone" ON public.event_attendees FOR SELECT USING (true);
CREATE POLICY "Users can join events"          ON public.event_attendees FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave events"         ON public.event_attendees FOR DELETE USING (auth.uid() = user_id);

-- upgrade_interest
CREATE POLICY "Users can insert own upgrade interest" ON public.upgrade_interest
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── Auto-create user row on signup ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      'parisien_' || substr(NEW.id::text, 1, 6)
    ),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
