-- WhatsApp trip sheet: the Sales Agent keeps what the customer already told it (dates, party,
-- interests, hotel, what they turned down) on ai_conversations.lead, the same column and keys the
-- Website Concierge uses, so it stops asking for details it already has.
-- The column is added by 20261017100000_website_concierge.sql; repeated here so this file stands alone.
-- Additive. Rollback: REVOKE UPDATE (lead) ON public.ai_conversations FROM lankalux_agent;

ALTER TABLE public.ai_conversations ADD COLUMN IF NOT EXISTS lead jsonb NOT NULL DEFAULT '{}'::jsonb;
GRANT UPDATE (lead) ON public.ai_conversations TO lankalux_agent;
