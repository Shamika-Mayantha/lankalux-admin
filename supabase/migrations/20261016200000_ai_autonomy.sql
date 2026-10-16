-- AI autonomy, step 1: the AI Manager approves routine customer messages.
--
-- * Routine WhatsApp replies and info requests move from Level 1 (would run with no review)
--   to Level 2: every customer message now needs the AI Manager's (or the owner's) approval.
--   Quotes, discounts, payments, refunds, bookings and anything exceptional stay Level 3:
--   only the owner can approve those, and the database refuses a manager decision on them.
-- * ai_settings.owner_approves_messages keeps its meaning: while ON (the default), the owner
--   approves every customer message as before. The owner switches it OFF on the AI page to let
--   the Manager approve Level 2 messages.
-- * ai_notifications.emailed_at: the console emails pings to the owner and records when.
--
-- Additive and idempotent. Rollback: set both message levels back to 1 and drop emailed_at.

BEGIN;

UPDATE public.ai_action_policies
SET level = 2, updated_at = now()
WHERE action_type IN ('message.routine_reply', 'message.collect_info') AND level <> 2;

UPDATE public.ai_action_policies
SET description = 'Send a follow-up to a quiet lead (email or WhatsApp).', updated_at = now()
WHERE action_type = 'message.follow_up';

ALTER TABLE public.ai_notifications ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

COMMIT;
