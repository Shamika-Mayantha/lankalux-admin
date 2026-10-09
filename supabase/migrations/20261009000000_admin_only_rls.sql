-- Restrict admin tables to the LankaLux admin login.
--
-- Earlier migrations granted every table to any `authenticated` user, so anyone who could
-- sign up with the public anon key could read and edit client data directly. The app only
-- checked the admin email in its own code. Server routes use the service-role key, which
-- bypasses RLS, so they keep working; the browser (legacy dashboard) still works because
-- it signs in as the admin.
--
-- If the admin login ever changes (NEXT_PUBLIC_ADMIN_EMAIL), update is_lankalux_admin().
-- Companion-app tables (trips, trip_*, drivers, app_profiles) are left untouched.

CREATE OR REPLACE FUNCTION public.is_lankalux_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'hello@lankalux.com'
$$;

DO $$
DECLARE
  t text;
  pol record;
  admin_tables text[] := ARRAY[
    'Client Requests',
    'Vehicle Reservations',
    'website_chat_sessions',
    'itinerary_shares',
    'itineraries',
    'itinerary_generations',
    'share_links',
    'activity_logs',
    'communications',
    'hotels',
    'request_hotels',
    'vehicles',
    'invoice_settings',
    'invoices',
    'invoice_payments',
    'invoice_public_links'
  ];
BEGIN
  FOREACH t IN ARRAY admin_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY "Admin manages %s" ON public.%I FOR ALL TO authenticated USING (public.is_lankalux_admin()) WITH CHECK (public.is_lankalux_admin())',
      t, t
    );
  END LOOP;
END $$;
