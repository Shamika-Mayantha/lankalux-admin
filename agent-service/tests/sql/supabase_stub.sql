-- Minimal stand-in for the Supabase/LankaLux schema so the AI migration can be tested
-- on a plain local Postgres. Not used in production.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;
CREATE SCHEMA auth; CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
-- Columns copied from the live table (2026-10-15).
CREATE TABLE public."Client Requests" (
  id text PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  client_name text,
  email text,
  whatsapp text,
  start_date date,
  duration text,
  origin_country text,
  additional_preferences text,
  itineraryoptions text,
  end_date date,
  status text,
  updated_at timestamp with time zone DEFAULT now(),
  request_code text,
  number_of_adults integer,
  number_of_children integer,
  children_ages text,
  selected_option integer,
  public_token text,
  notes text,
  sent_at timestamp with time zone,
  last_sent_at timestamp with time zone,
  email_sent_count integer,
  last_sent_option integer,
  sent_options jsonb,
  follow_up_emails_sent text,
  cancellation_reason text,
  link_opens text,
  hotel_options text,
  assigned_employee text,
  lead_source text,
  budget text,
  hotel_preference text,
  vehicle_preference text,
  special_requirements text,
  interests text,
  arrival_flight text,
  departure_flight text,
  requested_destinations text,
  selected_itinerary_id uuid,
  published_itinerary_id uuid,
  generation_logs jsonb,
  activity_log jsonb,
  app_published_at timestamp with time zone,
  assigned_driver_id uuid,
  assigned_vehicle_id text,
  guest_user_id uuid,
  sold_price text,
  created_by uuid,
  assigned_agent_id uuid,
  traffic_source text);
CREATE TABLE public.communications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id text, channel text,
  recipient text, subject text, body text, status text, direction text, from_address text, created_at timestamptz DEFAULT now());
CREATE TABLE public.activity_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id text, actor text,
  event_type text, detail jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.admin_users (user_id uuid PRIMARY KEY REFERENCES auth.users(id), email text, role text, active boolean);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['itineraries','invoices','invoice_payments','trips','trip_days','hotels','request_hotels',
    'vehicles','drivers','share_links','website_chat_sessions'] LOOP
    EXECUTE format('CREATE TABLE public.%I (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), start_date date)', t);
  END LOOP; END $$;
CREATE FUNCTION public.is_lankalux_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND role = 'supervisor' AND active) $$;
