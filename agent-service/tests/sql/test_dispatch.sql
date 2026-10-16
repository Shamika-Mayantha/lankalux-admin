-- Dispatch: the database calls the console when work becomes runnable, with a Vault token.
DO $$ DECLARE a uuid; tok text; BEGIN
  SELECT decrypted_secret INTO tok FROM vault.decrypted_secrets WHERE name = 'ai_dispatch_token';
  IF length(tok) <> 64 THEN RAISE EXCEPTION 'FAIL D1: no token'; END IF;
  IF NOT public.ai_check_dispatch_token(tok) OR public.ai_check_dispatch_token('x' || tok)
     OR public.ai_check_dispatch_token(NULL) OR public.ai_check_dispatch_token('') THEN
    RAISE EXCEPTION 'FAIL D2: token check';
  END IF;

  -- A manager approval of a customer message triggers one call, carrying the token.
  INSERT INTO public.ai_actions (agent_key, action_type, level, summary, payload)
  VALUES ('sales', 'message.routine_reply', 2, 'Reply', '{"text":"hi","to":"94770000000"}') RETURNING id INTO a;
  IF (SELECT level FROM public.ai_actions WHERE id = a) <> 2 THEN RAISE EXCEPTION 'FAIL D3: routine reply is not level 2'; END IF;
  INSERT INTO public.ai_approvals (action_id, decided_by_kind, decision) VALUES (a, 'manager', 'approve');
  IF (SELECT count(*) FROM net.calls WHERE headers->>'x-ai-dispatch-token' = tok
        AND url = 'https://admin.lankalux.com/api/ai/dispatch') <> 1 THEN
    RAISE EXCEPTION 'FAIL D4: approval did not dispatch';
  END IF;

  -- A revise (Manager flagged it) does not dispatch; an owner ping does.
  INSERT INTO public.ai_approvals (action_id, decided_by_kind, decision) VALUES (a, 'manager', 'revise');
  INSERT INTO public.ai_notifications (kind, title) VALUES ('info', 'fyi');
  IF (SELECT count(*) FROM net.calls) <> 1 THEN RAISE EXCEPTION 'FAIL D5: dispatched for nothing'; END IF;
  INSERT INTO public.ai_notifications (kind, title) VALUES ('attention', 'Look');
  IF (SELECT count(*) FROM net.calls) <> 2 THEN RAISE EXCEPTION 'FAIL D6: ping did not dispatch'; END IF;

  -- Handing approvals to the Manager dispatches (approved replies can go now).
  UPDATE public.ai_settings SET owner_approves_messages = false;
  IF (SELECT count(*) FROM net.calls) <> 3 THEN RAISE EXCEPTION 'FAIL D7: setting change did not dispatch'; END IF;

  -- The 5-minute job only calls when something waits.
  PERFORM public.ai_dispatch_if_pending();
  IF (SELECT count(*) FROM net.calls) <> 4 THEN RAISE EXCEPTION 'FAIL D8: pending work not dispatched'; END IF;
  UPDATE public.ai_actions SET status = 'cancelled' WHERE id = a;
  UPDATE public.ai_notifications SET emailed_at = now();
  PERFORM public.ai_dispatch_if_pending();
  IF (SELECT count(*) FROM net.calls) <> 4 THEN RAISE EXCEPTION 'FAIL D9: idle job dispatched'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.jobs WHERE name = 'ai-dispatch' AND schedule = '*/5 * * * *') THEN
    RAISE EXCEPTION 'FAIL D10: cron job missing';
  END IF;
END $$;

-- A network failure never rolls back the write that triggered it.
INSERT INTO net.fail_next VALUES (true);
INSERT INTO public.ai_notifications (kind, title) VALUES ('error', 'Still saved');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_notifications WHERE title = 'Still saved') THEN RAISE EXCEPTION 'FAIL D11'; END IF;
END $$;

-- Nobody but the service role can read the token or trigger a call.
SET ROLE lankalux_agent;
DO $$ BEGIN
  BEGIN PERFORM public.ai_check_dispatch_token('x'); RAISE EXCEPTION 'FAIL D12: agent can check the token';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.ai_request_dispatch('x'); RAISE EXCEPTION 'FAIL D13: agent can dispatch';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.ai_check_dispatch_token('x'); RAISE EXCEPTION 'FAIL D14: signed-in users can check the token';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT 'ALL SQL DISPATCH TESTS PASSED' AS result;
