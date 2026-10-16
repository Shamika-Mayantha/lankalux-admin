-- AI WhatsApp replies, step 1 (test number): every customer message waits for the owner.
--
-- * ai_settings.owner_approves_messages (default ON): while on, ai_begin_action() refuses
--   any customer-facing action without an owner approval, whatever its policy level.
--   Level 1 auto-replies stay impossible until the owner switches this off.
-- * The whatsapp-send Edge Function (service role) runs approved message actions through
--   ai_begin_action()/ai_finish_action(); the agent service only proposes them.
--
-- Additive and idempotent. Rollback: ALTER TABLE public.ai_settings DROP COLUMN
-- owner_approves_messages, then re-run the ai_begin_action() body from
-- 20261016000000_ai_agent_system.sql.

BEGIN;

ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS owner_approves_messages boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.ai_begin_action(p_action_id uuid)
RETURNS public.ai_actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.ai_actions;
  pol public.ai_action_policies;
  s public.ai_settings;
  ag public.ai_agents;
  conv public.ai_conversations;
  has_reject boolean;
  has_manager boolean;
  has_owner boolean;
BEGIN
  SELECT * INTO a FROM public.ai_actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown action %', p_action_id; END IF;
  IF a.status NOT IN ('proposed', 'approved') THEN
    RAISE EXCEPTION 'Action % is %, not runnable', p_action_id, a.status;
  END IF;

  SELECT * INTO s FROM public.ai_settings WHERE id;
  IF s.system_paused THEN RAISE EXCEPTION 'AI system is paused'; END IF;

  SELECT * INTO ag FROM public.ai_agents WHERE key = a.agent_key;
  IF ag.paused THEN RAISE EXCEPTION 'Agent % is paused', a.agent_key; END IF;

  SELECT * INTO pol FROM public.ai_action_policies WHERE action_type = a.action_type;
  IF NOT FOUND OR NOT pol.enabled THEN
    RAISE EXCEPTION 'Action type % is not permitted', a.action_type;
  END IF;

  IF pol.customer_facing THEN
    IF NOT s.customer_messaging_enabled THEN
      RAISE EXCEPTION 'Customer messaging is switched off';
    END IF;
    IF a.conversation_id IS NOT NULL THEN
      SELECT * INTO conv FROM public.ai_conversations WHERE id = a.conversation_id;
      IF conv.mode <> 'ai' THEN
        RAISE EXCEPTION 'Conversation is under human control';
      END IF;
    END IF;
  END IF;

  SELECT
    bool_or(decision = 'reject'),
    bool_or(decision = 'approve' AND decided_by_kind = 'manager'),
    bool_or(decision = 'approve' AND decided_by_kind = 'owner' AND EXISTS (
      SELECT 1 FROM public.admin_users u
      WHERE u.user_id = ap.decided_by AND u.role = 'supervisor' AND u.active
    ))
  INTO has_reject, has_manager, has_owner
  FROM public.ai_approvals ap
  WHERE ap.action_id = a.id;

  IF coalesce(has_reject, false) THEN RAISE EXCEPTION 'Action % was rejected', a.id; END IF;
  IF pol.customer_facing AND coalesce(s.owner_approves_messages, true) AND NOT coalesce(has_owner, false) THEN
    RAISE EXCEPTION 'Action % needs owner approval (every customer message is approved by the owner)', a.id;
  END IF;
  IF pol.level = 2 AND NOT (coalesce(has_manager, false) OR coalesce(has_owner, false)) THEN
    RAISE EXCEPTION 'Action % needs AI Manager approval', a.id;
  END IF;
  IF pol.level = 3 AND NOT coalesce(has_owner, false) THEN
    RAISE EXCEPTION 'Action % needs owner approval', a.id;
  END IF;

  UPDATE public.ai_actions SET status = 'executing' WHERE id = a.id RETURNING * INTO a;
  -- CRM writes in this transaction are the AI's own; the event triggers skip them.
  PERFORM set_config('lankalux.actor', 'ai', true);
  INSERT INTO public.ai_activity_log (actor_kind, agent_key, action_id, task_id, request_id, event, detail)
  VALUES ('agent', a.agent_key, a.id, a.task_id, a.request_id, 'action.begin',
          jsonb_build_object('action_type', a.action_type, 'level', pol.level));
  RETURN a;
END $$;

-- Same grants as before: the agent service and the server-side service role only.
REVOKE EXECUTE ON FUNCTION public.ai_begin_action(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_begin_action(uuid) TO lankalux_agent, service_role;
GRANT EXECUTE ON FUNCTION public.ai_finish_action(uuid, boolean, jsonb, text) TO service_role;

COMMIT;
