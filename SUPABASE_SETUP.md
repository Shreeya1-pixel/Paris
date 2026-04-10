# Supabase Setup — Openworld Paris

Follow these steps **in order**. Each SQL block can be pasted directly into the Supabase SQL Editor.

---

## Step 1 — Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project**
3. Choose a name, set a strong database password, pick a region close to Paris (e.g. `eu-west-3`)
4. Once created, go to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Paste both into your `.env.local` file

---

## Step 2 — Enable Authentication providers

1. In the sidebar go to **Authentication → Providers**
2. **Email** — enabled by default ✓
3. **Google** — enable, paste your Google OAuth Client ID + Secret
   - Redirect URL to add in Google Console: `https://<your-project>.supabase.co/auth/v1/callback`
   - Also add `http://localhost:3000` to allowed origins in Google Console

---

## Step 3 — Run the full schema SQL

Go to **SQL Editor → New query**, paste the entire block below, then click **Run**.

```sql
-- ═══════════════════════════════════════════════════════════
--  OPENWORLD PARIS — Full Database Schema
--  Paste this entire block into Supabase SQL Editor and run.
-- ═══════════════════════════════════════════════════════════

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username            TEXT UNIQUE NOT NULL,
  full_name           TEXT,
  avatar_url          TEXT,
  vibes               TEXT[]  DEFAULT '{}',
  interests           TEXT[]  DEFAULT '{}',
  arrondissement      TEXT,
  preference_profile  JSONB   DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  title_i18n       JSONB DEFAULT '{}'::jsonb,
  description_i18n JSONB DEFAULT '{}'::jsonb,
  category         TEXT NOT NULL,
  vibe_tags        TEXT[]  DEFAULT '{}',
  start_time       TIMESTAMPTZ NOT NULL,
  end_time         TIMESTAMPTZ,
  location_name    TEXT,
  arrondissement   TEXT,
  address          TEXT,
  lat              DOUBLE PRECISION NOT NULL,
  lng              DOUBLE PRECISION NOT NULL,
  image_url        TEXT,
  ticket_url       TEXT,
  is_free          BOOLEAN DEFAULT true,
  price            NUMERIC(10,2),
  max_attendees    INT,
  attendee_count   INT DEFAULT 0,
  source           TEXT DEFAULT 'user',
  status           TEXT DEFAULT 'active',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_lat_lng        ON public.events(lat, lng);
CREATE INDEX IF NOT EXISTS idx_events_start_time     ON public.events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_category       ON public.events(category);
CREATE INDEX IF NOT EXISTS idx_events_arrondissement ON public.events(arrondissement);
CREATE INDEX IF NOT EXISTS idx_events_status         ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_created_by     ON public.events(created_by);

-- ── Paris Places (curated) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paris_places (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,
  description    TEXT,
  address        TEXT NOT NULL,
  arrondissement TEXT NOT NULL,
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,
  image_url      TEXT,
  tags           TEXT[]  DEFAULT '{}',
  opening_hours  JSONB,
  price_range    TEXT,
  website_url    TEXT,
  instagram_url  TEXT,
  is_featured    BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_places_lat_lng        ON public.paris_places(lat, lng);
CREATE INDEX IF NOT EXISTS idx_places_category       ON public.paris_places(category);
CREATE INDEX IF NOT EXISTS idx_places_arrondissement ON public.paris_places(arrondissement);
CREATE INDEX IF NOT EXISTS idx_places_is_featured    ON public.paris_places(is_featured);

-- ── Saved Events ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_events (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_events_user ON public.saved_events(user_id);

-- ── Saved Places ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_places (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  place_id  UUID NOT NULL REFERENCES public.paris_places(id) ON DELETE CASCADE,
  saved_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_places_user ON public.saved_places(user_id);

-- ── Event Attendees ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_attendees (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id  UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON public.event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user  ON public.event_attendees(user_id);
```

---

## Step 4 — Enable Row Level Security (RLS)

**New query → paste → Run:**

```sql
-- ── Enable RLS on every table ────────────────────────────────
ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paris_places     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_places     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendees  ENABLE ROW LEVEL SECURITY;

-- ── users ────────────────────────────────────────────────────
CREATE POLICY "Users are viewable by everyone"
  ON public.users FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- ── events ───────────────────────────────────────────────────
CREATE POLICY "Active events viewable by everyone"
  ON public.events FOR SELECT USING (status = 'active');

CREATE POLICY "Auth users can create events"
  ON public.events FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own events"
  ON public.events FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own events"
  ON public.events FOR DELETE USING (auth.uid() = created_by);

-- ── paris_places (public read-only) ─────────────────────────
CREATE POLICY "Paris places viewable by everyone"
  ON public.paris_places FOR SELECT USING (true);

-- ── saved_events ─────────────────────────────────────────────
CREATE POLICY "Users view own saved events"
  ON public.saved_events FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own saved events"
  ON public.saved_events FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own saved events"
  ON public.saved_events FOR DELETE USING (auth.uid() = user_id);

-- ── saved_places ─────────────────────────────────────────────
CREATE POLICY "Users view own saved places"
  ON public.saved_places FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own saved places"
  ON public.saved_places FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own saved places"
  ON public.saved_places FOR DELETE USING (auth.uid() = user_id);

-- ── event_attendees ──────────────────────────────────────────
CREATE POLICY "Attendees viewable by everyone"
  ON public.event_attendees FOR SELECT USING (true);

CREATE POLICY "Users can join events"
  ON public.event_attendees FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave events"
  ON public.event_attendees FOR DELETE USING (auth.uid() = user_id);
```

### RLS is not a Table Editor toggle

Supabase does **not** show “Enable RLS” as a checkbox in the **Table Editor** grid. Enabling RLS happens when you run the `ALTER TABLE … ENABLE ROW LEVEL SECURITY` lines above. If that query finished without errors, RLS is already on.

**Where to see it in the dashboard**

1. Open **Database** → **Tables** (or **Table Editor**).
2. Click a table name (e.g. `events`).
3. Open the **Policies** tab (or **RLS** / **Authentication** depending on your dashboard version). You should see the policies you created (e.g. “Active events viewable by everyone”).

If you only see rows and columns, use the sidebar tabs for that table — **Policies** is separate from the data grid.

**Verify with SQL** (SQL Editor → New query → Run):

```sql
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;
```

Every app table should show `rls_enabled = true`. If a table shows `false`, run only the matching line from Step 4, for example:

`ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;`

**If Step 4 failed partway** (e.g. “policy already exists” because you ran it twice): RLS may already be enabled from the `ALTER TABLE` lines; only the duplicate `CREATE POLICY` failed. Use the verification query above. To recreate policies cleanly you can drop and recreate them, or use `CREATE POLICY …` only once per policy name.

---

## Step 5 — Auto-create user row on signup (trigger)

**New query → paste → Run:**

```sql
-- Creates a users row automatically when someone signs up via Supabase Auth
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
```

---

## Step 6 — (Optional) Seed Paris places

If you have the curated places seed file, run:

```sql
-- Paste the contents of supabase/seed.sql here, or run:
-- psql "postgresql://postgres:<password>@<host>:5432/postgres" -f supabase/seed.sql
```

Or in the **Table Editor** you can import a CSV directly into `paris_places`.

---

## Checklist

| Step | Done |
|------|------|
| .env.local filled with URL + anon key | ☐ |
| Schema tables created (Step 3) | ☐ |
| RLS policies applied (Step 4) | ☐ |
| Auth trigger created (Step 5) | ☐ |
| Google OAuth configured | ☐ |
| App running: `npm run dev` | ☐ |

---

## Troubleshooting

**"relation does not exist"** — Make sure you ran Step 3 first, then Step 4.

**"new row violates row-level security"** — You're trying to insert without an auth session. Sign in first.

**Google OAuth not redirecting** — Check the Redirect URL in Google Console matches exactly:
`https://<project-ref>.supabase.co/auth/v1/callback`

**User row not created on signup** — Re-run Step 5 (the trigger). Check the trigger exists under **Database → Triggers**.
