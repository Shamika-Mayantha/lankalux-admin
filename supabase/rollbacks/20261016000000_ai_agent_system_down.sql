-- Rollback for 20261016000000_ai_agent_system.sql. Removes the AI system only;
-- CRM tables and data are untouched apart from the two event triggers and the
-- additive "Agent service reads CRM" policies. AI history is lost, so export the
-- ai_* tables first if it matters.
BEGIN;
DROP TRIGGER IF EXISTS ai_capture_request_event ON public."Client Requests";
DROP TRIGGER IF EXISTS ai_capture_communication_event ON public.communications;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Client Requests','communications','activity_logs','itineraries','invoices','invoice_payments',
                           'trips','trip_days','hotels','request_hotels','vehicles','drivers','share_links',
                           'website_chat_sessions','admin_users']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Agent service reads CRM" ON public.%I', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM lankalux_agent', t);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.ai_execute_crm_action(uuid);
DROP FUNCTION IF EXISTS public.ai_begin_action(uuid);
DROP FUNCTION IF EXISTS public.ai_finish_action(uuid, boolean, jsonb, text);
DROP FUNCTION IF EXISTS public.ai_claim_tasks(text, integer, integer);
DROP FUNCTION IF EXISTS public.ai_complete_task(uuid, text, text, jsonb, text, integer);
DROP FUNCTION IF EXISTS public.ai_enqueue_task(text, text, jsonb, text, uuid, text, integer, timestamptz, text, uuid, bigint);
DROP FUNCTION IF EXISTS public.ai_heartbeat(text, text);
DROP TABLE IF EXISTS public.ai_change_proposals, public.ai_corrections, public.ai_memory, public.ai_daily_summaries,
  public.ai_notifications, public.ai_activity_log, public.ai_messages, public.ai_conversations, public.ai_approvals,
  public.ai_actions, public.ai_tasks, public.ai_events, public.ai_action_policies, public.ai_agents, public.ai_settings CASCADE;
DROP FUNCTION IF EXISTS public.ai_capture_request_event();
DROP FUNCTION IF EXISTS public.ai_capture_communication_event();
DROP FUNCTION IF EXISTS public.ai_actions_set_level();
DROP FUNCTION IF EXISTS public.ai_touch_updated_at();
REVOKE ALL ON SCHEMA public, extensions FROM lankalux_agent;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM lankalux_agent;
DROP ROLE IF EXISTS lankalux_agent;
-- The vector extension is left installed; it is harmless and other features may use it.
COMMIT;
