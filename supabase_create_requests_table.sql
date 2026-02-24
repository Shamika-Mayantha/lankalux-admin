-- Create the "requests" table required by the admin app.
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor) for project evmsntnprujqfejkmipq.
-- A 404 on /rest/v1/requests means this table is missing.

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  client_name TEXT,
  email TEXT,
  whatsapp TEXT,
  start_date DATE,
  end_date DATE,
  duration INTEGER,
  origin_country TEXT,
  number_of_adults INTEGER,
  number_of_children INTEGER,
  children_ages TEXT,
  additional_preferences TEXT,
  itineraryoptions TEXT,
  selected_option INTEGER,
  public_token TEXT,
  status TEXT,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  last_sent_option INTEGER,
  email_sent_count INTEGER,
  sent_options TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Allow authenticated users to read and write (adjust if you use different auth)
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read write requests" ON requests;
CREATE POLICY "Allow authenticated read write requests"
  ON requests
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Optional: allow anon/service role if your app uses them
-- CREATE POLICY "Allow service role" ON requests FOR ALL TO service_role USING (true) WITH CHECK (true);
