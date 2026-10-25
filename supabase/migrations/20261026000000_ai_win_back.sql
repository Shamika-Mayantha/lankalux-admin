-- Win-back: once a week the Win-back agent drafts a short, friendly email to people who enquired
-- 30 to 365 days ago, never booked and have not heard from us in 30 days. Each one is a Level 3
-- message.win_back: it goes out only when the owner approves it on the AI page, from hello@, with
-- an unsubscribe link the dispatcher adds.
--
-- * ai_email_optouts: addresses that never get an AI-written email again (unsubscribe link, or the
--   owner adds them). Written only by the console (service role); the agent role may read it.
-- * ai_unsubscribe_tokens: one random token per sent email, so the link carries no address.
-- * ai_begin_action() also refuses any customer-facing email to an opted-out address, whatever the
--   agent or approval, so the rule is enforced by the database, not by the model.
-- Additive and idempotent.
-- Rollback: DROP TABLE public.ai_unsubscribe_tokens, public.ai_email_optouts; DELETE FROM public.ai_action_policies
--   WHERE action_type = 'message.win_back'; DELETE FROM public.ai_tasks WHERE agent_key = 'winback';
--   DELETE FROM public.ai_agents WHERE key = 'winback'; restore ai_agents_key_check from
--   20261025000000_ai_lead_scout.sql and ai_begin_action() from 20261016100000_ai_whatsapp_replies.sql.

BEGIN;

ALTER TABLE public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_key_check;
ALTER TABLE public.ai_agents
  ADD CONSTRAINT ai_agents_key_check
  CHECK (key IN ('manager', 'sales', 'planner', 'pricing', 'followup', 'operations', 'quality', 'concierge', 'scout', 'winback'));

INSERT INTO public.ai_agents (key, name, description) VALUES
  ('winback', 'Win-back',
   'Once a week writes a short, friendly email to people who enquired in the past year but never booked. Up to 10 a week, at most one per person every 6 months, each approved by you, with an unsubscribe link.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.ai_action_policies (action_type, level, customer_facing, description) VALUES
  ('message.win_back', 3, true, 'Email a past enquiry that never booked (owner approves each one).')
ON CONFLICT (action_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_email_optouts (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%'),
  source text NOT NULL DEFAULT 'link' CHECK (source IN ('link', 'owner')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_email_optouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_email_optouts FROM anon, authenticated;
GRANT SELECT ON public.ai_email_optouts TO authenticated;
DROP POLICY IF EXISTS "Supervisors read ai_email_optouts" ON public.ai_email_optouts;
CREATE POLICY "Supervisors read ai_email_optouts" ON public.ai_email_optouts FOR SELECT TO authenticated USING (public.is_lankalux_admin());
GRANT SELECT ON public.ai_email_optouts TO lankalux_agent;
DROP POLICY IF EXISTS "Agent service reads ai_email_optouts" ON public.ai_email_optouts;
CREATE POLICY "Agent service reads ai_email_optouts" ON public.ai_email_optouts FOR SELECT TO lankalux_agent USING (true);

-- Service role only (the dispatcher creates them, the public unsubscribe page reads them).
CREATE TABLE IF NOT EXISTS public.ai_unsubscribe_tokens (
  token text PRIMARY KEY CHECK (length(token) >= 32),
  email text NOT NULL CHECK (email = lower(btrim(email))),
  action_id uuid REFERENCES public.ai_actions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_unsubscribe_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.ai_begin_action(p_action_id uuid)
 RETURNS ai_actions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Anyone who unsubscribed never gets an AI-written email again (the address on the draft, or the request's current one).
    IF a.payload->>'channel' = 'email' AND EXISTS (
         SELECT 1 FROM public.ai_email_optouts o
         WHERE o.email = lower(btrim(a.payload->>'to'))
            OR o.email = (SELECT lower(btrim(r.email)) FROM public."Client Requests" r WHERE r.id = a.request_id)) THEN
      RAISE EXCEPTION 'Action % is an email to someone who unsubscribed', a.id;
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
  PERFORM set_config('lankalux.actor', 'ai', true);
  INSERT INTO public.ai_activity_log (actor_kind, agent_key, action_id, task_id, request_id, event, detail)
  VALUES ('agent', a.agent_key, a.id, a.task_id, a.request_id, 'action.begin',
          jsonb_build_object('action_type', a.action_type, 'level', pol.level));
  RETURN a;
END $function$;

COMMIT;
