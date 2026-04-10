-- Bilingual user content: optional JSONB maps { "en": "...", "fr": "..." }
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS title_i18n JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS description_i18n JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.events.title_i18n IS 'Optional localized titles; UI uses active language then falls back to title';
COMMENT ON COLUMN public.events.description_i18n IS 'Optional localized descriptions';
