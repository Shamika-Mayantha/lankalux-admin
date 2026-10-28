drop function if exists public.telegram_claim_wake(bigint, int);
alter table public.telegram_chats drop column if exists last_wake_at;
