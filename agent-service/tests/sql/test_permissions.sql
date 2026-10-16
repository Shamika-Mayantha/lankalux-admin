-- Permission and queue tests for the AI migration. Run on a scratch database after
-- supabase_stub.sql and the migration (see agent-service/tests/run_sql_tests.sh).
-- Every check raises on failure, so the script stops at the first broken rule.
\set ON_ERROR_STOP 1

-- t_expect_fail(sql, pattern): the statement must fail with an error matching pattern,
-- so a check cannot pass by failing for some unrelated reason.
CREATE FUNCTION public.t_expect_fail(q text, pat text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE q;
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT ILIKE pat THEN
      RAISE EXCEPTION 'FAIL: "%" failed with "%", expected "%"', q, SQLERRM, pat;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL: "%" should have failed (%)', q, pat;
END $f$;

-- A supervisor who can give owner approvals, and an agent-role staff member who cannot.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'hello@lankalux.com'),
  ('00000000-0000-0000-0000-000000000002', 'agent@lankalux.com');
INSERT INTO public.admin_users VALUES
  ('00000000-0000-0000-0000-000000000001', 'hello@lankalux.com', 'supervisor', true),
  ('00000000-0000-0000-0000-000000000002', 'agent@lankalux.com', 'agent', true);
INSERT INTO public."Client Requests" (id, client_name, status) VALUES ('req-id-007', 'Existing', 'follow_up');

-- 1. A CRM insert by staff produces exactly one event; the system starts paused with messaging off.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.ai_events WHERE event_type = 'lead.created' AND source_id = 'req-id-007') <> 1 THEN
    RAISE EXCEPTION 'FAIL 1: lead.created event missing';
  END IF;
  IF NOT (SELECT system_paused AND NOT customer_messaging_enabled FROM public.ai_settings) THEN
    RAISE EXCEPTION 'FAIL 1: unsafe defaults';
  END IF;
END $$;

SET ROLE lankalux_agent;

-- 2. The agent role cannot unpause itself, change policies or prompts, or write the CRM directly.
SELECT public.t_expect_fail($$UPDATE public.ai_settings SET system_paused = false$$, '%permission denied%');
SELECT public.t_expect_fail($$UPDATE public.ai_action_policies SET level = 1$$, '%permission denied%');
SELECT public.t_expect_fail($$UPDATE public.ai_agents SET system_prompt = 'x'$$, '%permission denied%');
SELECT public.t_expect_fail($$UPDATE public.ai_agents SET paused = false$$, '%permission denied%');
SELECT public.t_expect_fail($$UPDATE public."Client Requests" SET status = 'sold'$$, '%permission denied%');
SELECT public.t_expect_fail($$INSERT INTO public."Client Requests" (id) VALUES ('x')$$, '%permission denied%');
SELECT public.t_expect_fail($$INSERT INTO public.ai_tasks (agent_key, task_type) VALUES ('sales', 'x')$$, '%permission denied%');
SELECT public.t_expect_fail($$UPDATE public.ai_conversations SET mode = 'ai'$$, '%permission denied%');
SELECT public.t_expect_fail($$INSERT INTO public.ai_memory (kind, content, approved) VALUES ('business_rule', 'x', true)$$, '%row-level security%');
DO $$ BEGIN
  IF (SELECT count(*) FROM public."Client Requests") <> 1 THEN RAISE EXCEPTION 'FAIL 2: agent cannot read CRM'; END IF;
END $$;

-- 3. While paused, nothing is claimed and no action begins.
SELECT public.ai_enqueue_task('sales', 'handle_inquiry', '{}'::jsonb, 'req-id-007', NULL, 'dedupe-1') IS NOT NULL AS enqueued;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.ai_claim_tasks('w1', 5, 60)) THEN RAISE EXCEPTION 'FAIL 3: claimed while paused'; END IF;
END $$;

RESET ROLE;
UPDATE public.ai_settings SET system_paused = false;
SET ROLE lankalux_agent;

-- 4. Dedupe, single claim, and only the holder may complete.
DO $$
DECLARE t public.ai_tasks; n int;
BEGIN
  IF public.ai_enqueue_task('sales', 'handle_inquiry', '{}'::jsonb, 'req-id-007', NULL, 'dedupe-1') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 4a: duplicate task enqueued';
  END IF;
  SELECT * INTO t FROM public.ai_claim_tasks('w1', 1, 60);
  IF t.id IS NULL OR t.status <> 'running' OR t.attempts <> 1 THEN RAISE EXCEPTION 'FAIL 4b: claim'; END IF;
  SELECT count(*) INTO n FROM public.ai_claim_tasks('w2', 5, 60);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 4c: double claim'; END IF;
  PERFORM public.t_expect_fail(format('SELECT public.ai_complete_task(%L, %L, %L)', t.id, 'w2', 'succeeded'), '%not held by%');
  PERFORM public.ai_complete_task(t.id, 'w1', 'succeeded', '{"ok":true}'::jsonb);
  -- Finished, so the same key may be queued again.
  IF public.ai_enqueue_task('sales', 'handle_inquiry', '{}'::jsonb, 'req-id-007', NULL, 'dedupe-1') IS NULL THEN
    RAISE EXCEPTION 'FAIL 4d: finished task blocked its key';
  END IF;
END $$;

-- 5. Depth cap stops runaway chains.
DO $$
DECLARE parent uuid; child uuid; i int;
BEGIN
  parent := public.ai_enqueue_task('manager', 'chain', '{}'::jsonb, NULL, NULL, 'chain-0');
  FOR i IN 1..10 LOOP
    child := public.ai_enqueue_task('manager', 'chain', '{}'::jsonb, NULL, parent, 'chain-' || i);
    EXIT WHEN child IS NULL;
    parent := child;
  END LOOP;
  IF (SELECT max(depth) FROM public.ai_tasks WHERE task_type = 'chain') <> 5 THEN RAISE EXCEPTION 'FAIL 5: depth cap'; END IF;
END $$;

-- 6. A Level 1 CRM action runs through the gate, and its CRM write raises no new event.
DO $$
DECLARE a uuid; res jsonb; before_events int;
BEGIN
  SELECT count(*) INTO before_events FROM public.ai_events;
  INSERT INTO public.ai_actions (agent_key, action_type, level, summary, payload)
  VALUES ('sales', 'crm.create_lead', 3, 'New WhatsApp lead',
          '{"client_name":"Test Guest","whatsapp":"+94770000000","number_of_adults":"2"}')
  RETURNING id INTO a;
  IF (SELECT level FROM public.ai_actions WHERE id = a) <> 1 THEN RAISE EXCEPTION 'FAIL 6a: level not taken from policy'; END IF;
  res := public.ai_execute_crm_action(a);
  IF res->>'request_id' <> 'req-id-008' THEN RAISE EXCEPTION 'FAIL 6b: id scheme %', res; END IF;
  IF (SELECT status FROM public.ai_actions WHERE id = a) <> 'executed' THEN RAISE EXCEPTION 'FAIL 6c'; END IF;
  IF (SELECT count(*) FROM public.ai_events) <> before_events THEN RAISE EXCEPTION 'FAIL 6d: AI write raised an event (loop risk)'; END IF;
  -- Running it again is refused.
  PERFORM public.t_expect_fail(format('SELECT public.ai_execute_crm_action(%L)', a), '%not runnable%');
  -- An action type with no policy row is refused outright.
  PERFORM public.t_expect_fail($q$INSERT INTO public.ai_actions (agent_key, action_type, level, summary) VALUES ('sales', 'db.drop_everything', 1, 'x')$q$, '%not permitted%');
END $$;

-- 7. Level 3 cannot run without the owner, and the agent role cannot fake owner approval.
DO $$
DECLARE a uuid;
BEGIN
  INSERT INTO public.ai_actions (agent_key, action_type, level, summary, request_id)
  VALUES ('pricing', 'quote.discount', 1, 'Offer 10% off', 'req-id-007') RETURNING id INTO a;
  PERFORM public.t_expect_fail(format('SELECT public.ai_begin_action(%L)', a), '%switched off%');
END $$;
RESET ROLE;
UPDATE public.ai_settings SET customer_messaging_enabled = true;
SET ROLE lankalux_agent;
DO $$
DECLARE a uuid;
BEGIN
  SELECT id INTO a FROM public.ai_actions WHERE action_type = 'quote.discount';
  PERFORM public.t_expect_fail(format('SELECT public.ai_begin_action(%L)', a), '%needs owner approval%');
  PERFORM public.t_expect_fail(format(
    $q$INSERT INTO public.ai_approvals (action_id, decided_by_kind, decided_by, decision) VALUES (%L, 'owner', '00000000-0000-0000-0000-000000000001', 'approve')$q$, a),
    '%row-level security%');
  PERFORM public.t_expect_fail(format(
    $q$INSERT INTO public.ai_approvals (action_id, decided_by_kind, decision) VALUES (%L, 'manager', 'approve')$q$, a),
    '%row-level security%');
  PERFORM public.t_expect_fail(format($q$UPDATE public.ai_actions SET status = 'approved' WHERE id = %L$q$, a), '%row-level security%');
  PERFORM public.t_expect_fail(format($q$UPDATE public.ai_actions SET action_type = 'crm.add_note' WHERE id = %L$q$, a), '%permission denied%');
  PERFORM public.t_expect_fail(format('SELECT public.ai_begin_action(%L)', a), '%needs owner approval%');
END $$;

-- 8. Level 2 needs a manager approval, then runs; the workflow action cannot mark a request sold.
DO $$
DECLARE a uuid; b uuid;
BEGIN
  INSERT INTO public.ai_actions (agent_key, action_type, level, summary, request_id, payload)
  VALUES ('followup', 'workflow.change_status', 1, 'Expire stale lead', 'req-id-007', '{"status":"expired"}') RETURNING id INTO a;
  PERFORM public.t_expect_fail(format('SELECT public.ai_execute_crm_action(%L)', a), '%needs AI Manager approval%');
  INSERT INTO public.ai_approvals (action_id, decided_by_kind, decision) VALUES (a, 'manager', 'approve');
  PERFORM public.ai_execute_crm_action(a);
  IF (SELECT status FROM public."Client Requests" WHERE id = 'req-id-007') <> 'expired' THEN RAISE EXCEPTION 'FAIL 8b'; END IF;

  INSERT INTO public.ai_actions (agent_key, action_type, level, summary, request_id, payload)
  VALUES ('followup', 'workflow.change_status', 1, 'Sneaky', 'req-id-007', '{"status":"sold"}') RETURNING id INTO b;
  INSERT INTO public.ai_approvals (action_id, decided_by_kind, decision) VALUES (b, 'manager', 'approve');
  PERFORM public.t_expect_fail(format('SELECT public.ai_execute_crm_action(%L)', b), '%not allowed%');
  IF (SELECT status FROM public."Client Requests" WHERE id = 'req-id-007') <> 'expired' THEN RAISE EXCEPTION 'FAIL 8c'; END IF;
END $$;

RESET ROLE;

-- 9. The owner approves the Level 3 action (as the console's server route would). An
--    "owner" approval from someone who is not an active supervisor does not count.
DO $$
DECLARE a uuid;
BEGIN
  SELECT id INTO a FROM public.ai_actions WHERE action_type = 'quote.discount';
  INSERT INTO public.ai_approvals (action_id, decided_by_kind, decided_by, decision)
  VALUES (a, 'owner', '00000000-0000-0000-0000-000000000002', 'approve');
  PERFORM public.t_expect_fail(format('SELECT public.ai_begin_action(%L)', a), '%needs owner approval%');
  INSERT INTO public.ai_approvals (action_id, decided_by_kind, decided_by, decision)
  VALUES (a, 'owner', '00000000-0000-0000-0000-000000000001', 'approve');
  PERFORM public.ai_begin_action(a);
  IF (SELECT status FROM public.ai_actions WHERE id = a) <> 'executing' THEN RAISE EXCEPTION 'FAIL 9'; END IF;
END $$;

-- 10. Human takeover blocks AI messages in that conversation; a rejection blocks for good.
DO $$
DECLARE a uuid; b uuid; c uuid;
BEGIN
  INSERT INTO public.ai_conversations (channel, external_id, mode) VALUES ('whatsapp', '94770000000', 'human') RETURNING id INTO c;
  INSERT INTO public.ai_actions (agent_key, action_type, level, summary, conversation_id)
  VALUES ('sales', 'message.routine_reply', 1, 'Reply', c) RETURNING id INTO a;
  PERFORM public.t_expect_fail(format('SELECT public.ai_begin_action(%L)', a), '%human control%');
  UPDATE public.ai_conversations SET mode = 'ai' WHERE id = c;
  -- While owner_approves_messages is on (the default), even Level 1 messages need the owner.
  PERFORM public.t_expect_fail(format('SELECT public.ai_begin_action(%L)', a), '%needs owner approval%');
  UPDATE public.ai_settings SET owner_approves_messages = false;
  PERFORM public.ai_begin_action(a);
  UPDATE public.ai_settings SET owner_approves_messages = true;

  INSERT INTO public.ai_actions (agent_key, action_type, level, summary, conversation_id)
  VALUES ('sales', 'message.follow_up', 1, 'Follow up', c) RETURNING id INTO b;
  INSERT INTO public.ai_approvals (action_id, decided_by_kind, decided_by, decision)
  VALUES (b, 'owner', '00000000-0000-0000-0000-000000000001', 'reject');
  INSERT INTO public.ai_approvals (action_id, decided_by_kind, decision) VALUES (b, 'manager', 'approve');
  PERFORM public.t_expect_fail(format('SELECT public.ai_begin_action(%L)', b), '%rejected%');
END $$;

-- 11. Pausing one agent stops its tasks from being claimed and its actions from starting.
UPDATE public.ai_agents SET paused = true WHERE key = 'sales';
SET ROLE lankalux_agent;
DO $$
DECLARE a uuid;
BEGIN
  PERFORM public.ai_enqueue_task('sales', 'handle_inquiry', '{}'::jsonb, NULL, NULL, 'paused-1');
  IF EXISTS (SELECT 1 FROM public.ai_claim_tasks('w1', 50, 60) t WHERE t.agent_key = 'sales') THEN
    RAISE EXCEPTION 'FAIL 11a: paused agent task claimed';
  END IF;
  INSERT INTO public.ai_actions (agent_key, action_type, level, summary, request_id, payload)
  VALUES ('sales', 'crm.add_note', 1, 'Note', 'req-id-007', '{"note":"hi"}') RETURNING id INTO a;
  PERFORM public.t_expect_fail(format('SELECT public.ai_execute_crm_action(%L)', a), '%paused%');
END $$;
RESET ROLE;

-- 12. Expired leases are recovered (crash recovery).
UPDATE public.ai_agents SET paused = false WHERE key = 'sales';
UPDATE public.ai_tasks SET status = 'running', locked_by = 'dead-worker', locked_until = now() - interval '1 minute'
WHERE dedupe_key = 'paused-1';
SET ROLE lankalux_agent;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_claim_tasks('w9', 50, 60) t WHERE t.dedupe_key = 'paused-1' AND t.locked_by = 'w9') THEN
    RAISE EXCEPTION 'FAIL 12: expired lease not recovered';
  END IF;
END $$;
RESET ROLE;

-- 13. Inbound email still records an event, and a broken AI side never blocks a CRM write.
INSERT INTO public.communications (request_id, channel, direction, from_address, body)
VALUES ('req-id-007', 'email', 'inbound', 'guest@example.com', 'Hello');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_events WHERE event_type = 'inquiry.received') THEN RAISE EXCEPTION 'FAIL 13'; END IF;
END $$;
DROP TABLE public.ai_events CASCADE;
INSERT INTO public."Client Requests" (id, client_name, status) VALUES ('req-id-099', 'Still works', 'follow_up');
UPDATE public."Client Requests" SET status = 'sold' WHERE id = 'req-id-099';

SELECT 'ALL SQL PERMISSION TESTS PASSED' AS result;
