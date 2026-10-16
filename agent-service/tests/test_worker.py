from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg
from pydantic import BaseModel

from lankalux_agents.actions import Actions
from lankalux_agents.agents import ALL_AGENTS, Context
from lankalux_agents.agents.manager import ROUTES
from lankalux_agents.agents.sales import Qualification, Reply
from lankalux_agents.crm import CRM
from lankalux_agents.db import Database
from lankalux_agents.events import schedule
from lankalux_agents.llm import LLMError
from lankalux_agents.memory import Memory
from lankalux_agents.queue import Task, TaskQueue
from lankalux_agents.worker import Worker


class FakeLLM:
    """Returns canned structured output; records what it was asked."""

    def __init__(self, fail: bool = False, reply: Reply | None = None):
        self.calls: list[str] = []
        self.fail = fail
        self.reply = reply or Reply(kind="collect_info", reply="Lovely! When would you like to travel, and how many of you?", reason="dates and party size missing")

    def structured(self, system, user, schema: type[BaseModel], **_):
        self.calls.append(schema.__name__)
        if self.fail:
            raise LLMError("model down")
        if schema is Qualification:
            return Qualification(readiness="needs_info", missing=["children's ages"], note="Family of 3, Feb; ask ages.")
        if schema is Reply:
            return self.reply
        raise AssertionError(f"unexpected schema {schema}")

    def embed(self, text):
        return [0.0] * 768


def make_worker(dsn: str, llm) -> Worker:
    db = Database(dsn, max_size=2)
    queue = TaskQueue(db, "test-worker", 60)
    ctx = Context(queue=queue, llm=llm, actions=Actions(db), crm=CRM(db), memory=Memory(db, llm))
    return Worker(ctx, db, {cls.key: cls() for cls in ALL_AGENTS}, poll_seconds=0)


def test_every_route_targets_a_real_handler():
    agents = {cls.key: cls() for cls in ALL_AGENTS}
    for agent, task_type, _ in ROUTES.values():
        assert task_type in agents[agent].handlers, (agent, task_type)


def test_schedule_is_idempotent_per_period():
    seen: list[str] = []

    class Q:
        def enqueue(self, agent, task_type, payload, **kw):
            seen.append(kw["dedupe_key"])

    at = datetime(2026, 10, 16, 18, 30, tzinfo=ZoneInfo("Asia/Colombo"))
    schedule(Q(), at)
    schedule(Q(), at)
    assert seen.count("daily_summary:2026-10-16") == 2  # the database dedupes; the key is stable
    assert "followups:2026-10-16T18" in seen


def test_new_lead_flows_to_a_staff_note(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("""INSERT INTO public."Client Requests" (id, client_name, status, number_of_adults)
                     VALUES ('req-id-001', 'Anna', 'follow_up', 2)""")
    llm = FakeLLM()
    w = make_worker(test_db["agent"], llm)
    ran = [w.tick() for _ in range(4)]
    assert ran[:2] == [True, True]  # route_event, then qualify_lead
    with psycopg.connect(test_db["admin"]) as c:
        note = c.execute("SELECT actor, detail->>'note' FROM public.activity_logs WHERE event_type = 'ai_note'").fetchone()
        tasks = c.execute("SELECT agent_key, task_type, status FROM public.ai_tasks ORDER BY created_at").fetchall()
        events = c.execute("SELECT count(*) FROM public.ai_events").fetchone()[0]
    assert note == ("ai:sales", "Family of 3, Feb; ask ages.")
    assert ("manager", "route_event", "succeeded") in tasks
    assert ("sales", "qualify_lead", "succeeded") in tasks
    assert events == 1  # the AI's own note did not raise another event
    assert llm.calls == ["Qualification"]


def test_model_failure_retries_instead_of_crashing(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("""INSERT INTO public."Client Requests" (id, client_name, status) VALUES ('req-id-002', 'B', 'follow_up')""")
    w = make_worker(test_db["agent"], FakeLLM(fail=True))
    w.tick()  # route
    w.tick()  # qualify fails -> retry
    with psycopg.connect(test_db["admin"]) as c:
        row = c.execute("SELECT status, attempts, error FROM public.ai_tasks WHERE task_type = 'qualify_lead'").fetchone()
    assert row[0] == "queued" and row[1] == 1 and "model down" in row[2]


def test_paused_system_does_nothing(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("UPDATE public.ai_settings SET system_paused = true")
        c.execute("""INSERT INTO public."Client Requests" (id, client_name, status) VALUES ('req-id-003', 'C', 'follow_up')""")
    llm = FakeLLM()
    w = make_worker(test_db["agent"], llm)
    assert w.tick() is False
    assert llm.calls == []
    with psycopg.connect(test_db["admin"]) as c:
        assert c.execute("SELECT count(*) FROM public.ai_tasks").fetchone()[0] == 0
        assert c.execute("SELECT count(*) FROM public.ai_events WHERE processed_at IS NULL").fetchone()[0] == 1
        assert c.execute("SELECT count(*) FROM public.ai_agents WHERE last_heartbeat_at IS NOT NULL").fetchone()[0] > 0


def _whatsapp_hi(admin_dsn: str, text: str = "Hi", wamid: str = "wamid.1") -> str:
    """What the whatsapp-webhook Edge Function writes for one inbound message."""
    with psycopg.connect(admin_dsn, autocommit=True) as c:
        conv = c.execute("""INSERT INTO public.ai_conversations (channel, external_id, customer_name, last_message_at, service_window_expires_at)
                            VALUES ('whatsapp', '94770000000', 'Nimal', now(), now() + interval '24 hours')
                            ON CONFLICT (channel, external_id) DO UPDATE SET last_message_at = now() RETURNING id""").fetchone()[0]
        msg = c.execute("""INSERT INTO public.ai_messages (conversation_id, direction, sender_kind, body, provider_message_id)
                           VALUES (%s, 'inbound', 'customer', %s, %s) RETURNING id""", (conv, text, wamid)).fetchone()[0]
        c.execute("""INSERT INTO public.ai_events (event_type, source_table, source_id, payload, dedupe_key)
                     VALUES ('whatsapp.message_received', 'ai_messages', %s, %s, %s)""",
                  (str(msg), psycopg.types.json.Jsonb({"conversation_id": str(conv)}), f"wa:{wamid}"))
    return str(conv)


def test_whatsapp_message_becomes_a_reply_waiting_for_the_owner(test_db):
    conv = _whatsapp_hi(test_db["admin"])
    llm = FakeLLM()
    w = make_worker(test_db["agent"], llm)
    assert [w.tick() for _ in range(2)] == [True, True]  # route_event, then handle_inquiry
    assert llm.calls == ["Reply"]
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        action_id, kind, level, status, payload = c.execute(
            "SELECT id, action_type, level, status, payload FROM public.ai_actions WHERE conversation_id = %s", (conv,)).fetchone()
        assert (kind, level, status) == ("message.collect_info", 1, "proposed")
        assert payload["to"] == "94770000000" and "how many" in payload["text"]
        assert c.execute("SELECT count(*) FROM public.ai_notifications WHERE kind = 'approval_needed'").fetchone()[0] == 1

        # Even with customer messaging on, a Level 1 message needs the owner while owner_approves_messages is on.
        c.execute("UPDATE public.ai_settings SET customer_messaging_enabled = true")
        try:
            c.execute("SELECT public.ai_begin_action(%s)", (action_id,))
            raise AssertionError("gate let an unapproved customer message through")
        except psycopg.errors.RaiseException as err:
            assert "needs owner approval" in str(err)

        owner = c.execute("INSERT INTO auth.users (email) VALUES ('hello@lankalux.com') RETURNING id").fetchone()[0]
        c.execute("INSERT INTO public.admin_users (user_id, email, role, active) VALUES (%s, 'hello@lankalux.com', 'supervisor', true)", (owner,))
        c.execute("INSERT INTO public.ai_approvals (action_id, decided_by_kind, decided_by, decision) VALUES (%s, 'owner', %s, 'approve')", (action_id, owner))
        assert c.execute("SELECT (public.ai_begin_action(%s)).status", (action_id,)).fetchone()[0] == "executing"


def test_newer_message_replaces_the_unsent_draft(test_db):
    conv = _whatsapp_hi(test_db["admin"])
    w = make_worker(test_db["agent"], FakeLLM())
    for _ in range(2):
        w.tick()
    _whatsapp_hi(test_db["admin"], "We are 2 adults in March", "wamid.2")
    for _ in range(2):
        w.tick()
    with psycopg.connect(test_db["admin"]) as c:
        rows = c.execute("SELECT status FROM public.ai_actions WHERE conversation_id = %s ORDER BY created_at", (conv,)).fetchall()
    assert [r[0] for r in rows] == ["cancelled", "proposed"]


def test_taken_over_conversation_gets_no_ai_reply(test_db):
    conv = _whatsapp_hi(test_db["admin"])
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("UPDATE public.ai_conversations SET mode = 'human' WHERE id = %s", (conv,))
    llm = FakeLLM()
    w = make_worker(test_db["agent"], llm)
    for _ in range(2):
        w.tick()
    assert llm.calls == []
    with psycopg.connect(test_db["admin"]) as c:
        assert c.execute("SELECT count(*) FROM public.ai_actions").fetchone()[0] == 0


def test_sensitive_message_goes_to_a_person(test_db):
    _whatsapp_hi(test_db["admin"], "I want a refund")
    w = make_worker(test_db["agent"], FakeLLM(reply=Reply(kind="needs_human", reply="", reason="refund request")))
    for _ in range(2):
        w.tick()
    with psycopg.connect(test_db["admin"]) as c:
        assert c.execute("SELECT count(*) FROM public.ai_actions").fetchone()[0] == 0
        assert c.execute("SELECT body FROM public.ai_notifications WHERE kind = 'attention'").fetchone()[0] == "refund request"
