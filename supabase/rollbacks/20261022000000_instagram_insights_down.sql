-- Rollback for 20261022000000_instagram_insights.sql. Removes the Instagram copy only;
-- nothing on Instagram itself is touched. Also delete the IG_ACCESS_TOKEN edge secret.
SELECT cron.unschedule('instagram-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-sync');
BEGIN;
DROP FUNCTION IF EXISTS public.instagram_request_sync();
DROP FUNCTION IF EXISTS public.instagram_check_sync_token(text);
DELETE FROM vault.secrets WHERE name = 'instagram_sync_token';
DROP TABLE IF EXISTS public.instagram_media, public.instagram_account, public.instagram_token;
COMMIT;
