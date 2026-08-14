-- LankaLux Console v2 foundation
-- ADDITIVE ONLY. Does not drop or rename production objects.
-- Safe to run in the existing Supabase project used by "Client Requests".

-- ---------------------------------------------------------------------------
-- Extra request fields (all nullable so existing rows remain valid)
-- ---------------------------------------------------------------------------
ALTER TABLE "Client Requests"
  ADD COLUMN IF NOT EXISTS assigned_employee TEXT,
  ADD COLUMN IF NOT EXISTS lead_source TEXT,
  ADD COLUMN IF NOT EXISTS budget TEXT,
  ADD COLUMN IF NOT EXISTS hotel_preference TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_preference TEXT,
  ADD COLUMN IF NOT EXISTS special_requirements TEXT,
  ADD COLUMN IF NOT EXISTS interests TEXT,
  ADD COLUMN IF NOT EXISTS arrival_flight TEXT,
  ADD COLUMN IF NOT EXISTS departure_flight TEXT,
  ADD COLUMN IF NOT EXISTS requested_destinations TEXT,
  ADD COLUMN IF NOT EXISTS selected_itinerary_id UUID,
  ADD COLUMN IF NOT EXISTS published_itinerary_id UUID,
  ADD COLUMN IF NOT EXISTS generation_logs JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS activity_log JSONB DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Itineraries: one row per option (1, 2, 3) — source of truth
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  option_number INTEGER NOT NULL CHECK (option_number IN (1, 2, 3)),
  style TEXT NOT NULL CHECK (style IN ('balanced', 'relaxed', 'experience')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('empty', 'generating', 'draft', 'published', 'failed', 'archived')),
  is_selected BOOLEAN NOT NULL DEFAULT false,
  title TEXT,
  summary TEXT,
  duration TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  vehicle_id TEXT,
  internal_notes TEXT,
  prompt_version TEXT,
  model TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, option_number)
);

CREATE INDEX IF NOT EXISTS itineraries_request_id_idx ON public.itineraries (request_id);
CREATE INDEX IF NOT EXISTS itineraries_selected_idx ON public.itineraries (request_id) WHERE is_selected;

-- ---------------------------------------------------------------------------
-- Generation logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itinerary_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  itinerary_id UUID REFERENCES public.itineraries(id) ON DELETE SET NULL,
  itinerary_number INTEGER NOT NULL CHECK (itinerary_number IN (1, 2, 3)),
  prompt_version TEXT,
  model TEXT,
  success BOOLEAN NOT NULL,
  error TEXT,
  raw_response TEXT,
  parsed_response JSONB,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itinerary_generations_request_idx
  ON public.itinerary_generations (request_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Share links: TEXT request_id (fixes uuid mismatch on itinerary_shares)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.share_links (
  token TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  itinerary_id UUID REFERENCES public.itineraries(id) ON DELETE SET NULL,
  itinerary_snapshot JSONB NOT NULL,
  send_options JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS share_links_request_idx ON public.share_links (request_id);

-- ---------------------------------------------------------------------------
-- Activity + communications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  actor TEXT,
  event_type TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_request_idx
  ON public.activity_logs (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  recipient TEXT,
  subject TEXT,
  body TEXT,
  itinerary_id UUID REFERENCES public.itineraries(id) ON DELETE SET NULL,
  share_token TEXT,
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS communications_request_idx
  ON public.communications (request_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Hotels catalogue (global) + per-request attachments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  destination TEXT,
  star_category TEXT,
  description TEXT,
  room_category TEXT,
  meal_plan TEXT,
  price_internal TEXT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  website TEXT,
  contact TEXT,
  internal_notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hotels_destination_idx ON public.hotels (destination);
CREATE INDEX IF NOT EXISTS hotels_active_idx ON public.hotels (active);

CREATE TABLE IF NOT EXISTS public.request_hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  itinerary_id UUID REFERENCES public.itineraries(id) ON DELETE SET NULL,
  day_number INTEGER,
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS request_hotels_request_idx ON public.request_hotels (request_id);

-- ---------------------------------------------------------------------------
-- Vehicles (seeded from existing fleet catalogue)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  passenger_capacity INTEGER,
  luggage_capacity TEXT,
  description TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  availability_status TEXT NOT NULL DEFAULT 'available',
  internal_notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.vehicles (id, name, type, passenger_capacity, luggage_capacity, description, photos)
VALUES
  ('sedan', 'Sedan', 'Sedan', 3, '2 large + 2 small', 'Comfortable sedan for city transfers and short trips. Ideal for couples or small groups with standard luggage.', '["/Fleet/sedan1.jpg","/Fleet/sedan2.jpg","/Fleet/sedan3.jpg"]'::jsonb),
  ('voxy', 'Toyota Voxy', 'MPV', 7, '4 large', 'Spacious 7-seater van perfect for families and small groups. Ample legroom and luggage space for a relaxed journey.', '["/Fleet/voxy1.jpg","/Fleet/voxy2.jpg","/Fleet/voxy3.jpg"]'::jsonb),
  ('kdh-standard', 'Toyota KDH Standard Roof', 'Van', 10, '8 large', 'High-capacity standard-roof van for groups. Comfortable seating and generous luggage space for longer journeys.', '["/Fleet/flatroof1.jpg","/Fleet/flatroof2.jpg","/Fleet/flatroof3.jpg"]'::jsonb),
  ('kdh-high', 'Toyota KDH High Roof', 'Van', 12, '10 large', 'Standing-height high roof van for maximum comfort on longer journeys. Ideal for safari and adventure trips.', '["/Fleet/highroof1.jpg","/Fleet/highroof2.jpg","/Fleet/highroof3.jpg"]'::jsonb),
  ('suv', 'SUV', 'SUV', 5, '4 large', 'Premium SUV for couples and small families who prefer a higher ride and extra luggage flexibility.', '["/Fleet/sedan1.jpg","/Fleet/sedan2.jpg"]'::jsonb),
  ('partybus', 'Party Bus', 'Coach', 20, 'Limited', 'Luxury party bus for celebrations and group travel.', '["/Fleet/partybus1.jpg","/Fleet/partybus2.jpg","/Fleet/partybus3.jpg"]'::jsonb),
  ('safarijeep', 'Safari Jeep', 'Safari', 6, 'Light', 'Open safari jeep for wildlife and national park tours.', '["/Fleet/safarijeep.jpg"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Keep legacy fleet ids used by the old UI
INSERT INTO public.vehicles (id, name, type, passenger_capacity, description, photos)
VALUES
  ('flatroof', 'Toyota KDH Standard Roof', 'Van', 10, 'High-capacity van with standard roof for extra luggage.', '["/Fleet/flatroof1.jpg","/Fleet/flatroof2.jpg","/Fleet/flatroof3.jpg"]'::jsonb),
  ('highroof', 'Toyota KDH High Roof', 'Van', 12, 'Standing-height high roof van for maximum comfort.', '["/Fleet/highroof1.jpg","/Fleet/highroof2.jpg","/Fleet/highroof3.jpg"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'itineraries' AND policyname = 'Authenticated manage itineraries') THEN
    CREATE POLICY "Authenticated manage itineraries" ON public.itineraries FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'itinerary_generations' AND policyname = 'Authenticated manage generations') THEN
    CREATE POLICY "Authenticated manage generations" ON public.itinerary_generations FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'share_links' AND policyname = 'Authenticated manage share links') THEN
    CREATE POLICY "Authenticated manage share links" ON public.share_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_logs' AND policyname = 'Authenticated manage activity') THEN
    CREATE POLICY "Authenticated manage activity" ON public.activity_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communications' AND policyname = 'Authenticated manage communications') THEN
    CREATE POLICY "Authenticated manage communications" ON public.communications FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hotels' AND policyname = 'Authenticated manage hotels') THEN
    CREATE POLICY "Authenticated manage hotels" ON public.hotels FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'request_hotels' AND policyname = 'Authenticated manage request hotels') THEN
    CREATE POLICY "Authenticated manage request hotels" ON public.request_hotels FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vehicles' AND policyname = 'Authenticated manage vehicles') THEN
    CREATE POLICY "Authenticated manage vehicles" ON public.vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
