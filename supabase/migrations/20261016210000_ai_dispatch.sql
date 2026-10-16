-- AI autonomy, step 2: approved work runs by itself.
--
-- When something becomes runnable (an approval, an itinerary request, a ping for the owner,
-- or the owner pressing Start), the database calls the admin console's dispatcher at
-- /api/ai/dispatch through pg_net. The dispatcher sends approved WhatsApp replies and follow-up
-- emails, runs itinerary generation and emails pings to the owner. Every action still goes
-- through ai_begin_action() inside the dispatcher, so this adds no way around the approval gate.
-- A pg_cron job repeats the call every 5 minutes while anything is waiting, as a safety net.
--
-- The call carries a random token kept in Supabase Vault. It is generated here, never leaves
-- the database except in that header, and the dispatcher checks it with
-- ai_check_dispatch_token() (service role only). Nobody has to copy it anywhere.
--
-- Extensions pg_net and pg_cron are free Supabase extensions. Idempotent.
-- Rollback: SELECT cron.unschedule('ai-dispatch'); drop the four triggers and the functions
-- below; ALTER TABLE public.ai_settings DROP COLUMN dispatch_url.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

BEGIN;

ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS dispatch_url text DEFAULT 'https://admin.lankalux.com/api/ai/dispatch';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'ai_dispatch_token') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'ai_dispatch_token',
                                'Shared secret for database -> admin /api/ai/dispatch calls');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ai_check_dispatch_token(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(length(p_token) >= 32 AND p_token = (
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ai_dispatch_token' LIMIT 1
  ), false)
$$;

-- Fire-and-forget: a failed call must never roll back the change that triggered it.
CREATE OR REPLACE FUNCTION public.ai_request_dispatch(p_reason text DEFAULT 'event')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target text;
  token text;
BEGIN
  SELECT dispatch_url INTO target FROM public.ai_settings WHERE id;
  SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name = 'ai_dispatch_token' LIMIT 1;
  IF target IS NULL OR target = '' OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := target,
    body := jsonb_build_object('reason', p_reason),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ai-dispatch-token', token),
    timeout_milliseconds := 60000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ai_request_dispatch failed: %', SQLERRM;
END $$;

-- Only call when something is actually waiting (keeps the 5-minute job quiet).
CREATE OR REPLACE FUNCTION public.ai_dispatch_if_pending()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM public.ai_actions a
       WHERE a.status = 'proposed'
         AND (a.action_type = 'itinerary.generate'
              OR (a.action_type LIKE 'message.%' AND EXISTS (
                    SELECT 1 FROM public.ai_approvals ap WHERE ap.action_id = a.id AND ap.decision = 'approve')))
         AND a.created_at > now() - interval '2 days')
     OR EXISTS (
       SELECT 1 FROM public.ai_notifications n
       WHERE n.emailed_at IS NULL AND n.kind IN ('attention', 'approval_needed', 'error', 'summary')
         AND n.created_at > now() - interval '1 day') THEN
    PERFORM public.ai_request_dispatch('cron');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ai_dispatch_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ai_request_dispatch(TG_TABLE_NAME);
  RETURN NULL;
END $$;

CREATE OR REPLACE TRIGGER ai_dispatch_on_approval AFTER INSERT ON public.ai_approvals
  FOR EACH ROW WHEN (NEW.decision = 'approve') EXECUTE FUNCTION public.ai_dispatch_trigger();
CREATE OR REPLACE TRIGGER ai_dispatch_on_action AFTER INSERT ON public.ai_actions
  FOR EACH ROW WHEN (NEW.action_type = 'itinerary.generate') EXECUTE FUNCTION public.ai_dispatch_trigger();
CREATE OR REPLACE TRIGGER ai_dispatch_on_notification AFTER INSERT ON public.ai_notifications
  FOR EACH ROW WHEN (NEW.kind IN ('attention', 'approval_needed', 'error', 'summary'))
  EXECUTE FUNCTION public.ai_dispatch_trigger();
CREATE OR REPLACE TRIGGER ai_dispatch_on_resume AFTER UPDATE ON public.ai_settings
  FOR EACH ROW WHEN ((OLD.system_paused AND NOT NEW.system_paused)
                     OR (NOT OLD.customer_messaging_enabled AND NEW.customer_messaging_enabled)
                     OR (OLD.owner_approves_messages AND NOT NEW.owner_approves_messages))
  EXECUTE FUNCTION public.ai_dispatch_trigger();

REVOKE EXECUTE ON FUNCTION public.ai_check_dispatch_token(text), public.ai_request_dispatch(text),
  public.ai_dispatch_if_pending(), public.ai_dispatch_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_check_dispatch_token(text) TO service_role;

COMMIT;

SELECT cron.schedule('ai-dispatch', '*/5 * * * *', 'SELECT public.ai_dispatch_if_pending()');
