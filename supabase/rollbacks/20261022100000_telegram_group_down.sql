-- Rollback for 20261022100000_telegram_group.sql. Message history is lost; export it first if needed.
-- Also delete the TELEGRAM_BOT_TOKEN edge secret and the telegram-bot function.
BEGIN;
DROP TRIGGER IF EXISTS telegram_send_on_reply ON public.telegram_messages;
DROP FUNCTION IF EXISTS public.telegram_send_trigger();
DROP FUNCTION IF EXISTS public.telegram_request(text);
DROP FUNCTION IF EXISTS public.telegram_check_internal_token(text);
DROP FUNCTION IF EXISTS public.telegram_check_webhook_secret(text);
DELETE FROM vault.secrets WHERE name = 'telegram_bot_token_internal';
DROP TABLE IF EXISTS public.telegram_messages, public.telegram_chats;
COMMIT;
