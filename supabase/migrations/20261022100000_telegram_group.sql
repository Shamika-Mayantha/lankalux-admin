-- Telegram group chat for the content team (Shamika, the reels creator and Claude).
--
-- The telegram-bot edge function receives group messages from Telegram and stores them in
-- telegram_messages. Claude reads them on a schedule and writes replies as 'out' rows; a
-- trigger then asks the function (through pg_net, with a Vault token, same pattern as
-- instagram-sync) to send them. Only chats listed in telegram_chats get replies.
--
-- Secrets (Supabase dashboard, never in code or chat): TELEGRAM_BOT_TOKEN from @BotFather.
-- Free extensions only. Idempotent. Rollback: supabase/rollbacks/20261022100000_telegram_group_down.sql

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

BEGIN;

CREATE TABLE IF NOT EXISTS public.telegram_chats (
  chat_id bigint PRIMARY KEY,
  title text,
  allowed boolean NOT NULL DEFAULT false,   -- set true by hand for the content team group
  first_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.telegram_messages (
  id bigserial PRIMARY KEY,
  chat_id bigint NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  sender text,
  text text NOT NULL,
  tg_message_id bigint,
  reply_to_tg_message_id bigint,
  answered boolean NOT NULL DEFAULT false,  -- 'in' rows: Claude has dealt with it
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,                      -- 'out' rows
  error text
);
CREATE INDEX IF NOT EXISTS telegram_messages_chat_idx ON public.telegram_messages (chat_id, created_at DESC);

ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_chats, public.telegram_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.telegram_messages_id_seq FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'telegram_bot_token_internal') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'telegram_bot_token_internal',
                                'Shared secret for database -> telegram-bot edge function calls');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.telegram_check_internal_token(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(length(p_token) >= 32 AND p_token = (
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'telegram_bot_token_internal' LIMIT 1
  ), false)
$$;

-- Telegram sends this back in X-Telegram-Bot-Api-Secret-Token; derived from the Vault token
-- so nobody has to copy a second secret anywhere.
CREATE OR REPLACE FUNCTION public.telegram_check_webhook_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(length(p_secret) = 64 AND p_secret = (
    SELECT encode(extensions.digest(decrypted_secret || ':webhook', 'sha256'), 'hex')
    FROM vault.decrypted_secrets WHERE name = 'telegram_bot_token_internal' LIMIT 1
  ), false)
$$;

-- Fire-and-forget call to the function: 'send' flushes unsent replies, 'register' sets the webhook.
CREATE OR REPLACE FUNCTION public.telegram_request(p_action text DEFAULT 'send')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token text;
BEGIN
  SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name = 'telegram_bot_token_internal' LIMIT 1;
  IF token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://evmsntnprujqfejkmipq.supabase.co/functions/v1/telegram-bot',
    body := jsonb_build_object('action', p_action),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-token', token),
    timeout_milliseconds := 60000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'telegram_request failed: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.telegram_send_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.telegram_request('send');
  RETURN NULL;
END $$;

CREATE OR REPLACE TRIGGER telegram_send_on_reply AFTER INSERT ON public.telegram_messages
  FOR EACH ROW WHEN (NEW.direction = 'out') EXECUTE FUNCTION public.telegram_send_trigger();

REVOKE EXECUTE ON FUNCTION public.telegram_check_internal_token(text), public.telegram_check_webhook_secret(text),
  public.telegram_request(text), public.telegram_send_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_check_internal_token(text), public.telegram_check_webhook_secret(text) TO service_role;

COMMIT;
