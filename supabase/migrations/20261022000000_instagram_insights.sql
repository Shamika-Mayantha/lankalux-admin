-- Instagram insights (read only), for the weekly reels planner.
--
-- The instagram-sync edge function reads the LankaLux Instagram account through the
-- Instagram API with Instagram Login (scopes instagram_business_basic and
-- instagram_business_manage_insights only, so it can read but never post) and stores
-- recent posts, reels and their numbers here. Claude reads these tables when planning reels.
--
-- The Instagram token never lives in code, chat or logs: the owner puts it in the edge
-- function secret IG_ACCESS_TOKEN once. The function refreshes it before its 60 days run
-- out and keeps the refreshed copy in instagram_token, which only the service role can read.
--
-- A pg_cron job calls the function once a day (06:00 Sri Lanka time) with a random token
-- kept in Supabase Vault, the same pattern as ai-dispatch. Free extensions only. Idempotent.
-- Rollback: supabase/rollbacks/20261022000000_instagram_insights_down.sql

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

BEGIN;

CREATE TABLE IF NOT EXISTS public.instagram_account (
  ig_user_id text PRIMARY KEY,
  username text,
  followers_count integer,
  media_count integer,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.instagram_media (
  id text PRIMARY KEY,
  posted_at timestamptz,
  media_type text,              -- IMAGE, VIDEO, CAROUSEL_ALBUM
  media_product_type text,      -- FEED, REELS, STORY
  caption text,
  permalink text,
  thumbnail_url text,
  like_count integer,
  comments_count integer,
  insights jsonb NOT NULL DEFAULT '{}'::jsonb,  -- views, reach, saved, shares, total_interactions, ig_reels_avg_watch_time (ms) ...
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS instagram_media_posted_at_idx ON public.instagram_media (posted_at DESC);

-- One row: the latest refreshed token. Service role only.
CREATE TABLE IF NOT EXISTS public.instagram_token (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  access_token text NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.instagram_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_token ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_account, public.instagram_media, public.instagram_token FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'instagram_sync_token') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'instagram_sync_token',
                                'Shared secret for database -> instagram-sync edge function calls');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.instagram_check_sync_token(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(length(p_token) >= 32 AND p_token = (
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'instagram_sync_token' LIMIT 1
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.instagram_request_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token text;
BEGIN
  SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name = 'instagram_sync_token' LIMIT 1;
  IF token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://evmsntnprujqfejkmipq.supabase.co/functions/v1/instagram-sync',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-instagram-sync-token', token),
    timeout_milliseconds := 120000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'instagram_request_sync failed: %', SQLERRM;
END $$;

REVOKE EXECUTE ON FUNCTION public.instagram_check_sync_token(text), public.instagram_request_sync()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_check_sync_token(text) TO service_role;

COMMIT;

-- 00:30 UTC = 06:00 in Sri Lanka.
SELECT cron.schedule('instagram-sync', '30 0 * * *', 'SELECT public.instagram_request_sync()');
