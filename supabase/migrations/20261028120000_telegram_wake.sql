-- Wake the "LankaLux Telegram group replies" task when someone writes in an allowed group,
-- so Claude answers within a minute instead of at the next twice-daily check.
-- The telegram-bot edge function asks telegram_claim_wake() before firing; it says yes at most
-- once per cooldown per chat, and never while an admin "Ask Claude now" run is still going.

alter table public.telegram_chats add column if not exists last_wake_at timestamptz;

create or replace function public.telegram_claim_wake(p_chat_id bigint, p_cooldown_seconds int default 45)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  if exists (
    select 1 from public.claude_bot_runs
    where bot = 'telegram_replies' and status = 'running'
      and started_at > now() - interval '45 minutes'
  ) then
    return false;
  end if;

  update public.telegram_chats
     set last_wake_at = now()
   where chat_id = p_chat_id
     and allowed
     and (last_wake_at is null or last_wake_at < now() - make_interval(secs => p_cooldown_seconds))
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.telegram_claim_wake(bigint, int) from public, anon, authenticated;
grant execute on function public.telegram_claim_wake(bigint, int) to service_role;
