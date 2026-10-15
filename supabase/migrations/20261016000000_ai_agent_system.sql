-- LankaLux AI agent system: tables, task queue, approval enforcement and CRM event capture.
--
-- Applied to LankaLux-CRM on 2026-10-15 with Shamika's approval, in parts (Supabase migrations
-- ai_agent_system_0_vector .. ai_agent_system_3_permissions) because the connector times out on
-- large or DROP-containing calls. Same objects as this file.
-- Rollback: supabase/rollbacks/20261016000000_ai_agent_system_down.sql
--
-- Design (see /mnt/project-files/ai-system/PLAN.md):
--  * Everything the AI owns lives in public.ai_* tables. Existing CRM tables are only
--    read, plus one AFTER trigger each on "Client Requests" and communications that
--    records an event. The triggers swallow their own errors, so a CRM write can never
--    fail because of the AI system.
--  * The agent service (Python, on Oracle) logs in as the restricted role
--    lankalux_agent, never with the service-role key. It can read the CRM, run the task
--    queue and propose actions. It cannot change policies, prompts, permissions or
--    settings, and it cannot record an owner approval.
--  * Every side effect goes through ai_actions. ai_begin_action() is the single gate:
--    it checks the action's level against ai_action_policies and the recorded
--    approvals, the global/agent pause switches, and human takeover, in SQL,
--    independently of any language model.
--  * Loop prevention: CRM writes made through ai_begin_action() set lankalux.actor = 'ai'
--    for the transaction and the event triggers ignore them. Events and tasks carry a
--    unique dedupe_key, and tasks carry a depth that is capped.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Role used by the agent service. NOLOGIN here; Shamika enables login and sets the
-- password themself in the SQL editor (never in chat, code or docs):
--   ALTER ROLE lankalux_agent LOGIN PASSWORD '<generated>';
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lankalux_agent') THEN
    CREATE ROLE lankalux_agent NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO lankalux_agent;
GRANT USAGE ON SCHEMA extensions TO lankalux_agent;

-- ---------------------------------------------------------------------------
-- Settings and agents (owner-controlled; the agent role can only read them, and
-- report its own heartbeat through ai_heartbeat()).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  system_paused boolean NOT NULL DEFAULT true,
  customer_messaging_enabled boolean NOT NULL DEFAULT false,
  max_task_depth integer NOT NULL DEFAULT 5,
  max_tasks_per_request_per_hour integer NOT NULL DEFAULT 30,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ai_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_agents (
  key text PRIMARY KEY CHECK (key IN ('manager', 'sales', 'planner', 'pricing', 'followup', 'operations', 'quality')),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  paused boolean NOT NULL DEFAULT false,
  model text,
  system_prompt text NOT NULL DEFAULT '',
  prompt_version integer NOT NULL DEFAULT 1,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat_at timestamptz,
  last_error text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ai_agents (key, name, description) VALUES
  ('manager',    'AI General Manager', 'Coordinates the specialists, reviews their work, approves Level 2 actions and reports to the owner.'),
  ('sales',      'Sales Agent',        'Handles customer enquiries, qualifies leads and keeps the CRM up to date.'),
  ('planner',    'Travel Planner',     'Requests itineraries from the existing LankaLux generator. Never changes its format.'),
  ('pricing',    'Pricing Agent',      'Prepares quotations from verified pricing data and business rules. Quotes always need owner approval.'),
  ('followup',   'Follow-up Agent',    'Watches leads and prepares permitted follow-ups.'),
  ('operations', 'Operations Agent',   'Watches bookings, trips, chauffeur assignments and customer requirements.'),
  ('quality',    'Quality Agent',      'Independently reviews agent outputs against business rules.')
ON CONFLICT (key) DO NOTHING;

-- Which authorisation level each action needs. Level 3 = owner. Unknown action types
-- are refused by ai_begin_action(), so a new capability needs a row here first.
CREATE TABLE IF NOT EXISTS public.ai_action_policies (
  action_type text PRIMARY KEY,
  level smallint NOT NULL CHECK (level IN (1, 2, 3)),
  customer_facing boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  description text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ai_action_policies (action_type, level, customer_facing, description) VALUES
  ('crm.create_lead',            1, false, 'Create a new Client Request from an enquiry.'),
  ('crm.update_lead_details',    1, false, 'Fill in travel details the customer gave (dates, party size, interests).'),
  ('crm.add_note',               1, false, 'Add an internal note to a request.'),
  ('task.assign_internal',       1, false, 'Create or assign an internal task to an agent.'),
  ('message.routine_reply',      1, true,  'Reply to a routine customer question inside the WhatsApp 24h window.'),
  ('message.collect_info',       1, true,  'Ask the customer for missing travel requirements.'),
  ('itinerary.generate',         1, false, 'Ask the existing generator for an itinerary option.'),
  ('itinerary.quality_check',    2, false, 'Accept or reject an itinerary after the Quality Agent review.'),
  ('itinerary.request_revision', 2, false, 'Send an itinerary back to the Travel Planner with corrections.'),
  ('workflow.change_status',     2, false, 'Move a request to another CRM status (not sold/cancelled).'),
  ('message.follow_up',          2, true,  'Send an approved follow-up to a customer.'),
  ('message.send_itinerary',     2, true,  'Send a checked itinerary link to the customer.'),
  ('quote.final',                3, true,  'Send a final quotation.'),
  ('quote.discount',             3, true,  'Offer any discount.'),
  ('finance.commitment',         3, true,  'Any financial commitment.'),
  ('finance.payment_request',    3, true,  'Request a payment or send an invoice.'),
  ('finance.refund',             3, true,  'Refund or partial refund.'),
  ('booking.confirm',            3, true,  'Confirm a booking or mark a request sold.'),
  ('policy.change',              3, false, 'Change a business rule, prompt or agent permission.'),
  ('customer.exceptional',       3, true,  'Anything unusual: complaints, cancellations, safety, legal or medical issues.')
ON CONFLICT (action_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Events and durable task queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  request_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS ai_events_unprocessed_idx ON public.ai_events (id) WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL REFERENCES public.ai_agents(key),
  task_type text NOT NULL,
  request_id text,
  conversation_id uuid,
  event_id bigint REFERENCES public.ai_events(id) ON DELETE SET NULL,
  parent_task_id uuid REFERENCES public.ai_tasks(id) ON DELETE SET NULL,
  depth integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  dedupe_key text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  locked_until timestamptz,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
-- One live task per dedupe key; finished tasks do not block a new one.
CREATE UNIQUE INDEX IF NOT EXISTS ai_tasks_dedupe_live_idx ON public.ai_tasks (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running', 'waiting');
CREATE INDEX IF NOT EXISTS ai_tasks_ready_idx ON public.ai_tasks (priority, run_after) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS ai_tasks_request_idx ON public.ai_tasks (request_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Actions and approvals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.ai_tasks(id) ON DELETE SET NULL,
  agent_key text NOT NULL REFERENCES public.ai_agents(key),
  action_type text NOT NULL REFERENCES public.ai_action_policies(action_type),
  level smallint NOT NULL,
  request_id text,
  conversation_id uuid,
  summary text NOT NULL,
  reasoning text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'executing', 'executed', 'failed', 'cancelled')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);
CREATE INDEX IF NOT EXISTS ai_actions_pending_idx ON public.ai_actions (level, created_at) WHERE status = 'proposed';
CREATE INDEX IF NOT EXISTS ai_actions_request_idx ON public.ai_actions (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.ai_actions(id) ON DELETE CASCADE,
  decided_by_kind text NOT NULL CHECK (decided_by_kind IN ('manager', 'owner')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision text NOT NULL CHECK (decision IN ('approve', 'reject', 'revise')),
  note text,
  edited_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- An owner decision must name the person who made it.
  CHECK (decided_by_kind = 'manager' OR decided_by IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ai_approvals_action_idx ON public.ai_approvals (action_id);

-- ---------------------------------------------------------------------------
-- Conversations (WhatsApp, email, and the owner's chat with the Manager)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email', 'owner')),
  external_id text NOT NULL,
  request_id text,
  customer_name text,
  mode text NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'human', 'closed')),
  taken_over_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  taken_over_at timestamptz,
  opted_in boolean NOT NULL DEFAULT false,
  service_window_expires_at timestamptz,
  last_message_at timestamptz,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id)
);
CREATE INDEX IF NOT EXISTS ai_conversations_request_idx ON public.ai_conversations (request_id);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_kind text NOT NULL CHECK (sender_kind IN ('customer', 'ai', 'staff', 'owner')),
  agent_key text REFERENCES public.ai_agents(key),
  action_id uuid REFERENCES public.ai_actions(id) ON DELETE SET NULL,
  body text NOT NULL,
  provider_message_id text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_messages_provider_idx ON public.ai_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Audit, notifications, summaries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_activity_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_kind text NOT NULL CHECK (actor_kind IN ('agent', 'owner', 'staff', 'system')),
  agent_key text,
  actor_user uuid,
  task_id uuid,
  action_id uuid,
  request_id text,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_activity_log_created_idx ON public.ai_activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_activity_log_request_idx ON public.ai_activity_log (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('approval_needed', 'attention', 'error', 'summary', 'info')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  request_id text,
  action_id uuid REFERENCES public.ai_actions(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_notifications_unread_idx ON public.ai_notifications (created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.ai_daily_summaries (
  day date PRIMARY KEY,
  summary text NOT NULL,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Memory and learning
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('customer_fact', 'experience', 'correction', 'business_rule', 'summary')),
  agent_key text REFERENCES public.ai_agents(key),
  request_id text,
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  embedding extensions.vector(768),
  -- business_rule memories only count once the owner approved them.
  approved boolean NOT NULL DEFAULT false,
  source_action_id uuid REFERENCES public.ai_actions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_memory_request_idx ON public.ai_memory (request_id);
CREATE INDEX IF NOT EXISTS ai_memory_embedding_idx ON public.ai_memory
  USING hnsw (embedding extensions.vector_cosine_ops);

CREATE TABLE IF NOT EXISTS public.ai_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid REFERENCES public.ai_actions(id) ON DELETE SET NULL,
  agent_key text REFERENCES public.ai_agents(key),
  request_id text,
  original jsonb NOT NULL,
  correction text NOT NULL,
  approved_outcome jsonb,
  corrected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  memory_id uuid REFERENCES public.ai_memory(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Owner-approved changes to prompts, rules and permissions. Agents may only propose.
CREATE TABLE IF NOT EXISTS public.ai_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_by text NOT NULL,
  target text NOT NULL CHECK (target IN ('system_prompt', 'business_rule', 'action_policy', 'agent_config')),
  target_key text NOT NULL,
  current_value jsonb,
  proposed_value jsonb NOT NULL,
  rationale text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Guard: only the owner path may change protected columns of ai_actions.
-- The agent role may move its own actions only through ai_begin_action/ai_finish_action.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER ai_tasks_touch BEFORE UPDATE ON public.ai_tasks
  FOR EACH ROW EXECUTE FUNCTION public.ai_touch_updated_at();
CREATE OR REPLACE TRIGGER ai_actions_touch BEFORE UPDATE ON public.ai_actions
  FOR EACH ROW EXECUTE FUNCTION public.ai_touch_updated_at();
CREATE OR REPLACE TRIGGER ai_conversations_touch BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.ai_touch_updated_at();

-- An action's level always comes from the policy table, never from the caller.
CREATE OR REPLACE FUNCTION public.ai_actions_set_level()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  pol public.ai_action_policies;
BEGIN
  SELECT * INTO pol FROM public.ai_action_policies WHERE action_type = NEW.action_type;
  IF NOT FOUND OR NOT pol.enabled THEN
    RAISE EXCEPTION 'Action type % is not permitted', NEW.action_type;
  END IF;
  NEW.level := pol.level;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'proposed';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER ai_actions_level BEFORE INSERT OR UPDATE OF action_type ON public.ai_actions
  FOR EACH ROW EXECUTE FUNCTION public.ai_actions_set_level();

-- ---------------------------------------------------------------------------
-- The gate. Returns the action row when it may run now and marks it 'executing';
-- raises otherwise. The caller performs the side effect and then calls
-- ai_finish_action(). SECURITY DEFINER so it can read approvals and admin_users
-- whatever the caller's grants are; it trusts nothing passed in except the id.
-- ---------------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.ai_finish_action(p_action_id uuid, p_ok boolean, p_result jsonb DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_actions
  SET status = CASE WHEN p_ok THEN 'executed' ELSE 'failed' END,
      result = p_result,
      error = left(p_error, 2000),
      executed_at = CASE WHEN p_ok THEN now() ELSE NULL END
  WHERE id = p_action_id AND status = 'executing';
  IF NOT FOUND THEN RAISE EXCEPTION 'Action % is not executing', p_action_id; END IF;
  INSERT INTO public.ai_activity_log (actor_kind, action_id, event, detail)
  VALUES ('agent', p_action_id, CASE WHEN p_ok THEN 'action.executed' ELSE 'action.failed' END,
          jsonb_build_object('error', left(p_error, 500)));
END $$;

-- ---------------------------------------------------------------------------
-- CRM writes the agent service may make, all through the gate above. The agent role
-- has no write grant on any CRM table; this function is its only way in, and it
-- writes only the whitelisted fields.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_execute_crm_action(p_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.ai_actions;
  p jsonb;
  rid text;
  res jsonb;
BEGIN
  a := public.ai_begin_action(p_action_id);
  p := a.payload;

  IF a.action_type = 'crm.create_lead' THEN
    -- Same id scheme as the admin intake (req-id-NNN); the advisory lock keeps two AI
    -- inserts from picking the same number. The admin route retries on a clash.
    PERFORM pg_advisory_xact_lock(hashtext('ai_create_lead'));
    SELECT 'req-id-' || lpad((coalesce(max(substring(id FROM '^req-id-(\d+)$')::int), 0) + 1)::text, 3, '0')
      INTO rid FROM public."Client Requests";
    INSERT INTO public."Client Requests" (id, client_name, email, whatsapp, start_date, end_date, duration,
        number_of_adults, number_of_children, origin_country, additional_preferences, lead_source, status)
    VALUES (rid, p->>'client_name', p->>'email', p->>'whatsapp',
            nullif(p->>'start_date', '')::date, nullif(p->>'end_date', '')::date, p->>'duration',
            nullif(p->>'number_of_adults', '')::int, nullif(p->>'number_of_children', '')::int,
            p->>'origin_country', p->>'additional_preferences', coalesce(p->>'lead_source', 'ai_whatsapp'), 'follow_up');
    res := jsonb_build_object('request_id', rid);

  ELSIF a.action_type = 'crm.update_lead_details' THEN
    rid := coalesce(a.request_id, p->>'request_id');
    UPDATE public."Client Requests" SET
      start_date = coalesce(nullif(p->>'start_date', '')::date, start_date),
      end_date = coalesce(nullif(p->>'end_date', '')::date, end_date),
      number_of_adults = coalesce(nullif(p->>'number_of_adults', '')::int, number_of_adults),
      number_of_children = coalesce(nullif(p->>'number_of_children', '')::int, number_of_children),
      children_ages = coalesce(p->>'children_ages', children_ages),
      interests = coalesce(p->>'interests', interests),
      requested_destinations = coalesce(p->>'requested_destinations', requested_destinations),
      budget = coalesce(p->>'budget', budget),
      hotel_preference = coalesce(p->>'hotel_preference', hotel_preference),
      special_requirements = coalesce(p->>'special_requirements', special_requirements)
    WHERE id = rid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request % not found', rid; END IF;
    res := jsonb_build_object('request_id', rid);

  ELSIF a.action_type = 'crm.add_note' THEN
    rid := coalesce(a.request_id, p->>'request_id');
    INSERT INTO public.activity_logs (request_id, actor, event_type, detail)
    VALUES (rid, 'ai:' || a.agent_key, 'ai_note', jsonb_build_object('note', p->>'note', 'action_id', a.id));
    res := jsonb_build_object('request_id', rid);

  ELSIF a.action_type = 'workflow.change_status' THEN
    rid := coalesce(a.request_id, p->>'request_id');
    -- Sold and cancelled are owner decisions (booking.confirm / customer.exceptional).
    IF p->>'status' NOT IN ('follow_up', 'expired') THEN
      RAISE EXCEPTION 'Status % is not allowed for workflow.change_status', p->>'status';
    END IF;
    UPDATE public."Client Requests" SET status = p->>'status' WHERE id = rid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request % not found', rid; END IF;
    res := jsonb_build_object('request_id', rid, 'status', p->>'status');

  ELSE
    RAISE EXCEPTION 'Action type % is not a CRM action', a.action_type;
  END IF;

  PERFORM public.ai_finish_action(a.id, true, res, NULL);
  RETURN res;
END $$;

-- ---------------------------------------------------------------------------
-- Queue functions (SKIP LOCKED claiming with leases, so a crashed worker's tasks are
-- picked up again once its lease runs out).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_claim_tasks(p_worker text, p_limit integer DEFAULT 1, p_lease_seconds integer DEFAULT 300)
RETURNS SETOF public.ai_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT system_paused FROM public.ai_settings WHERE id) THEN
    RETURN;
  END IF;

  -- Expired leases go back to the queue, or fail once they used every attempt.
  UPDATE public.ai_tasks
  SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
      error = coalesce(error, 'Lease expired'),
      locked_by = NULL, locked_until = NULL,
      finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END
  WHERE status = 'running' AND locked_until < now();

  RETURN QUERY
  UPDATE public.ai_tasks t
  SET status = 'running',
      attempts = t.attempts + 1,
      locked_by = p_worker,
      locked_until = now() + make_interval(secs => p_lease_seconds)
  WHERE t.id IN (
    SELECT q.id FROM public.ai_tasks q
    JOIN public.ai_agents ag ON ag.key = q.agent_key AND NOT ag.paused
    WHERE q.status = 'queued' AND q.run_after <= now()
    ORDER BY q.priority, q.run_after
    LIMIT p_limit
    FOR UPDATE OF q SKIP LOCKED
  )
  RETURNING t.*;
END $$;

CREATE OR REPLACE FUNCTION public.ai_complete_task(p_task_id uuid, p_worker text, p_status text, p_result jsonb DEFAULT NULL, p_error text DEFAULT NULL, p_retry_in_seconds integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('succeeded', 'failed', 'waiting', 'retry') THEN
    RAISE EXCEPTION 'Bad status %', p_status;
  END IF;
  UPDATE public.ai_tasks
  SET status = CASE
        WHEN p_status = 'retry' AND attempts < max_attempts THEN 'queued'
        WHEN p_status = 'retry' THEN 'failed'
        ELSE p_status END,
      result = coalesce(p_result, result),
      error = left(p_error, 2000),
      run_after = CASE WHEN p_status = 'retry'
        THEN now() + make_interval(secs => coalesce(p_retry_in_seconds, 60)) ELSE run_after END,
      locked_by = NULL, locked_until = NULL,
      finished_at = CASE WHEN p_status IN ('succeeded', 'failed')
        OR (p_status = 'retry' AND attempts >= max_attempts) THEN now() ELSE NULL END
  WHERE id = p_task_id AND locked_by = p_worker AND status = 'running';
  IF NOT FOUND THEN RAISE EXCEPTION 'Task % is not held by %', p_task_id, p_worker; END IF;
END $$;

-- Enqueue with loop guards: depth cap, per-request rate cap, and dedupe.
CREATE OR REPLACE FUNCTION public.ai_enqueue_task(
  p_agent_key text, p_task_type text, p_payload jsonb DEFAULT '{}'::jsonb,
  p_request_id text DEFAULT NULL, p_parent_task_id uuid DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL, p_priority integer DEFAULT 100,
  p_run_after timestamptz DEFAULT now(), p_created_by text DEFAULT 'system',
  p_conversation_id uuid DEFAULT NULL, p_event_id bigint DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.ai_settings;
  parent_depth integer := -1;
  recent integer;
  new_id uuid;
BEGIN
  SELECT * INTO s FROM public.ai_settings WHERE id;
  IF p_parent_task_id IS NOT NULL THEN
    SELECT depth INTO parent_depth FROM public.ai_tasks WHERE id = p_parent_task_id;
  END IF;
  IF parent_depth + 1 > s.max_task_depth THEN
    INSERT INTO public.ai_activity_log (actor_kind, agent_key, request_id, event, detail)
    VALUES ('system', p_agent_key, p_request_id, 'task.depth_limit', jsonb_build_object('task_type', p_task_type, 'parent', p_parent_task_id));
    RETURN NULL;
  END IF;
  IF p_request_id IS NOT NULL THEN
    SELECT count(*) INTO recent FROM public.ai_tasks
    WHERE request_id = p_request_id AND created_at > now() - interval '1 hour';
    IF recent >= s.max_tasks_per_request_per_hour THEN
      INSERT INTO public.ai_activity_log (actor_kind, agent_key, request_id, event, detail)
      VALUES ('system', p_agent_key, p_request_id, 'task.rate_limit', jsonb_build_object('task_type', p_task_type));
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.ai_tasks (agent_key, task_type, payload, request_id, parent_task_id, depth,
                               dedupe_key, priority, run_after, created_by, conversation_id, event_id)
  VALUES (p_agent_key, p_task_type, coalesce(p_payload, '{}'::jsonb), p_request_id, p_parent_task_id,
          parent_depth + 1, p_dedupe_key, p_priority, p_run_after, p_created_by, p_conversation_id, p_event_id)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running', 'waiting')
  DO NOTHING
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.ai_heartbeat(p_agent_key text, p_error text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.ai_agents SET last_heartbeat_at = now(), last_error = left(p_error, 1000) WHERE key = p_agent_key;
$$;

-- ---------------------------------------------------------------------------
-- CRM event capture. AFTER triggers; errors are logged as warnings, never raised.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_capture_request_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev text;
BEGIN
  IF current_setting('lankalux.actor', true) = 'ai' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    ev := 'lead.created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    ev := 'lead.status_changed';
  ELSIF NEW.selected_itinerary_id IS DISTINCT FROM OLD.selected_itinerary_id
     OR NEW.published_itinerary_id IS DISTINCT FROM OLD.published_itinerary_id THEN
    ev := 'itinerary.changed';
  ELSIF (NEW.start_date, NEW.end_date, NEW.number_of_adults, NEW.number_of_children, NEW.additional_preferences,
         NEW.special_requirements, NEW.assigned_agent_id, NEW.assigned_driver_id)
     IS DISTINCT FROM (OLD.start_date, OLD.end_date, OLD.number_of_adults, OLD.number_of_children, OLD.additional_preferences,
         OLD.special_requirements, OLD.assigned_agent_id, OLD.assigned_driver_id) THEN
    ev := 'lead.updated';
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.ai_events (event_type, source_table, source_id, request_id, payload, dedupe_key)
  VALUES (ev, 'Client Requests', NEW.id, NEW.id,
          jsonb_build_object('status', NEW.status, 'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END),
          ev || ':' || NEW.id || ':' || extract(epoch FROM coalesce(NEW.updated_at, now()))::text)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'ai_capture_request_event skipped: %', SQLERRM;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.ai_capture_communication_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('lankalux.actor', true) = 'ai' OR NEW.direction IS DISTINCT FROM 'inbound' THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.ai_events (event_type, source_table, source_id, request_id, payload, dedupe_key)
  VALUES ('inquiry.received', 'communications', NEW.id::text, NEW.request_id,
          jsonb_build_object('channel', NEW.channel, 'from', NEW.from_address),
          'inquiry.received:' || NEW.id::text)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'ai_capture_communication_event skipped: %', SQLERRM;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.ai_capture_request_event(), public.ai_capture_communication_event()
  FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER ai_capture_request_event AFTER INSERT OR UPDATE ON public."Client Requests"
  FOR EACH ROW EXECUTE FUNCTION public.ai_capture_request_event();
CREATE OR REPLACE TRIGGER ai_capture_communication_event AFTER INSERT ON public.communications
  FOR EACH ROW EXECUTE FUNCTION public.ai_capture_communication_event();

-- Time-based events (pending follow-ups, trips starting soon) are produced by the
-- agent service's scheduler from CRM reads, so no pg_cron is needed.

-- ---------------------------------------------------------------------------
-- Row level security. Supervisors read everything in the console; writes from the
-- console go through server routes. lankalux_agent gets exactly what it needs.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_settings','ai_agents','ai_action_policies','ai_events','ai_tasks','ai_actions',
                           'ai_approvals','ai_conversations','ai_messages','ai_activity_log','ai_notifications',
                           'ai_daily_summaries','ai_memory','ai_corrections','ai_change_proposals']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS "Supervisors read %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Supervisors read %s" ON public.%I FOR SELECT TO authenticated USING (public.is_lankalux_admin())', t, t);
    EXECUTE format('GRANT SELECT ON public.%I TO lankalux_agent', t);
    EXECUTE format('DROP POLICY IF EXISTS "Agent service reads %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Agent service reads %s" ON public.%I FOR SELECT TO lankalux_agent USING (true)', t, t);
  END LOOP;
END $$;

-- What the agent service may write directly. Everything else (settings, agents,
-- policies, owner approvals, change decisions) it cannot touch.
GRANT INSERT ON public.ai_actions, public.ai_conversations, public.ai_messages, public.ai_activity_log,
                public.ai_notifications, public.ai_daily_summaries, public.ai_memory, public.ai_corrections,
                public.ai_change_proposals, public.ai_approvals TO lankalux_agent;
GRANT UPDATE (processed_at) ON public.ai_events TO lankalux_agent;
GRANT UPDATE (summary, request_id, customer_name, last_message_at, service_window_expires_at, opted_in)
  ON public.ai_conversations TO lankalux_agent;
GRANT UPDATE (status, provider_message_id) ON public.ai_messages TO lankalux_agent;
GRANT UPDATE (embedding) ON public.ai_memory TO lankalux_agent;
GRANT UPDATE (status) ON public.ai_actions TO lankalux_agent;
GRANT USAGE ON SEQUENCE public.ai_activity_log_id_seq TO lankalux_agent;

DROP POLICY IF EXISTS "Agent service writes actions" ON public.ai_actions;
CREATE POLICY "Agent service writes actions" ON public.ai_actions FOR INSERT TO lankalux_agent WITH CHECK (true);
-- The agent service may only cancel its own proposals; approval goes through ai_approvals.
DROP POLICY IF EXISTS "Agent service cancels proposals" ON public.ai_actions;
CREATE POLICY "Agent service cancels proposals" ON public.ai_actions FOR UPDATE TO lankalux_agent
  USING (status = 'proposed') WITH CHECK (status = 'cancelled');
-- Only AI Manager decisions; owner decisions come from the console's server route.
DROP POLICY IF EXISTS "Agent service records manager decisions" ON public.ai_approvals;
CREATE POLICY "Agent service records manager decisions" ON public.ai_approvals FOR INSERT TO lankalux_agent
  WITH CHECK (decided_by_kind = 'manager' AND decided_by IS NULL
    AND EXISTS (SELECT 1 FROM public.ai_actions a WHERE a.id = action_id AND a.level = 2));
DROP POLICY IF EXISTS "Agent service writes conversations" ON public.ai_conversations;
CREATE POLICY "Agent service writes conversations" ON public.ai_conversations FOR INSERT TO lankalux_agent WITH CHECK (true);
DROP POLICY IF EXISTS "Agent service updates conversations" ON public.ai_conversations;
CREATE POLICY "Agent service updates conversations" ON public.ai_conversations FOR UPDATE TO lankalux_agent USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Agent service writes messages" ON public.ai_messages;
CREATE POLICY "Agent service writes messages" ON public.ai_messages FOR INSERT TO lankalux_agent
  WITH CHECK (sender_kind IN ('customer', 'ai'));
DROP POLICY IF EXISTS "Agent service updates messages" ON public.ai_messages;
CREATE POLICY "Agent service updates messages" ON public.ai_messages FOR UPDATE TO lankalux_agent USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Agent service logs activity" ON public.ai_activity_log;
CREATE POLICY "Agent service logs activity" ON public.ai_activity_log FOR INSERT TO lankalux_agent WITH CHECK (actor_kind IN ('agent', 'system'));
DROP POLICY IF EXISTS "Agent service notifies" ON public.ai_notifications;
CREATE POLICY "Agent service notifies" ON public.ai_notifications FOR INSERT TO lankalux_agent WITH CHECK (true);
DROP POLICY IF EXISTS "Agent service writes summaries" ON public.ai_daily_summaries;
CREATE POLICY "Agent service writes summaries" ON public.ai_daily_summaries FOR INSERT TO lankalux_agent WITH CHECK (true);
-- Agents can remember facts and experiences; a business rule they write stays unapproved.
DROP POLICY IF EXISTS "Agent service writes memory" ON public.ai_memory;
CREATE POLICY "Agent service writes memory" ON public.ai_memory FOR INSERT TO lankalux_agent WITH CHECK (approved = false);
DROP POLICY IF EXISTS "Agent service embeds memory" ON public.ai_memory;
CREATE POLICY "Agent service embeds memory" ON public.ai_memory FOR UPDATE TO lankalux_agent USING (true) WITH CHECK (approved = false OR kind <> 'business_rule');
DROP POLICY IF EXISTS "Agent service records corrections" ON public.ai_corrections;
CREATE POLICY "Agent service records corrections" ON public.ai_corrections FOR INSERT TO lankalux_agent WITH CHECK (corrected_by IS NULL);
DROP POLICY IF EXISTS "Agent service proposes changes" ON public.ai_change_proposals;
CREATE POLICY "Agent service proposes changes" ON public.ai_change_proposals FOR INSERT TO lankalux_agent WITH CHECK (status = 'proposed');
DROP POLICY IF EXISTS "Agent service marks events" ON public.ai_events;
CREATE POLICY "Agent service marks events" ON public.ai_events FOR UPDATE TO lankalux_agent USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION public.ai_begin_action(uuid), public.ai_finish_action(uuid, boolean, jsonb, text),
  public.ai_execute_crm_action(uuid),
  public.ai_claim_tasks(text, integer, integer), public.ai_complete_task(uuid, text, text, jsonb, text, integer),
  public.ai_enqueue_task(text, text, jsonb, text, uuid, text, integer, timestamptz, text, uuid, bigint),
  public.ai_heartbeat(text, text) TO lankalux_agent;
REVOKE EXECUTE ON FUNCTION public.ai_begin_action(uuid), public.ai_finish_action(uuid, boolean, jsonb, text),
  public.ai_execute_crm_action(uuid),
  public.ai_claim_tasks(text, integer, integer), public.ai_complete_task(uuid, text, text, jsonb, text, integer),
  public.ai_enqueue_task(text, text, jsonb, text, uuid, text, integer, timestamptz, text, uuid, bigint),
  public.ai_heartbeat(text, text) FROM PUBLIC, anon, authenticated;

-- Read-only CRM access for the agent service (additive policies; existing ones untouched).
GRANT SELECT ON public."Client Requests", public.communications, public.activity_logs, public.itineraries,
  public.invoices, public.invoice_payments, public.trips, public.trip_days, public.hotels, public.request_hotels,
  public.vehicles, public.drivers, public.share_links, public.website_chat_sessions, public.admin_users
  TO lankalux_agent;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Client Requests','communications','activity_logs','itineraries','invoices','invoice_payments',
                           'trips','trip_days','hotels','request_hotels','vehicles','drivers','share_links',
                           'website_chat_sessions','admin_users']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Agent service reads CRM" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Agent service reads CRM" ON public.%I FOR SELECT TO lankalux_agent USING (true)', t);
  END LOOP;
END $$;

COMMIT;
