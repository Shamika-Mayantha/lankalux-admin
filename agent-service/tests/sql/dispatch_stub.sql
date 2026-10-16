-- Local stand-ins for Supabase's pg_net, Vault and pg_cron, so the dispatch migration can be tested.
CREATE SCHEMA IF NOT EXISTS net; CREATE SCHEMA IF NOT EXISTS vault; CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS net.calls (id serial, url text, body jsonb, headers jsonb, fail boolean DEFAULT false);
CREATE TABLE IF NOT EXISTS net.fail_next (on_ boolean);
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) RETURNS bigint
LANGUAGE plpgsql AS $$ BEGIN
  IF EXISTS (SELECT 1 FROM net.fail_next) THEN RAISE EXCEPTION 'network down'; END IF;
  INSERT INTO net.calls (url, body, headers) VALUES (url, body, headers); RETURN 1; END $$;
CREATE TABLE IF NOT EXISTS vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text, description text);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS SELECT id, name, secret AS decrypted_secret FROM vault.secrets;
CREATE OR REPLACE FUNCTION vault.create_secret(s text, n text, d text) RETURNS uuid LANGUAGE sql AS
  $$ INSERT INTO vault.secrets (name, secret, description) VALUES (n, s, d) RETURNING id $$;
CREATE TABLE IF NOT EXISTS cron.jobs (name text PRIMARY KEY, schedule text, command text);
CREATE OR REPLACE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE sql AS
  $$ INSERT INTO cron.jobs VALUES (n, s, c) ON CONFLICT (name) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command RETURNING 1::bigint $$;
