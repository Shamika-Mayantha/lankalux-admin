from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg
import pytest
from pydantic import BaseModel

from lankalux_agents.actions import Actions
from lankalux_agents.agents import ALL_AGENTS, Context
from lankalux_agents.agents.followup import FollowUpEmail
from lankalux_agents.agents.manager import ROUTES, Review, Summary
from lankalux_agents.agents.sales import HANDED_OVER, Qualification, Reply, TripSheet, first_name
from lankalux_agents.crm import CRM
from lankalux_agents.db import Database
from lankalux_agents.events import schedule
from lankalux_agents.llm import LLMError
from lankalux_agents.memory import Memory
from lankalux_agents.queue import Task, TaskQueue
from lankalux_agents.worker import Worker


class FakeLLM:
    """Returns canned structured output; records what it was asked."""

    def __init__(self, fail: bool = False, reply: Reply | list[Reply] | None = None, review: Review | None = None,
                 qualification: Qualification | None = None, email: FollowUpEmail | None = None):
        self.calls: list[str] = []
        self.systems: list[str] = []
        self.fail = fail
        self.reply = reply or Reply(kind="collect_info", reply="Lovely! When would you like to travel, and how many of you?", reason="dates and party size missing")
        self.review = review or Review(decision="approve", reason="Routine, friendly question about dates.")
        self.qualification = qualification or Qualification(readiness="needs_info", missing=["children's ages"], note="Family of 3, Feb; ask ages.")
        self.email = email or FollowUpEmail(subject="Your Sri Lanka trip", body="Just checking in about your trip in March. Shall I adjust anything?")

    def structured(self, system, user, schema: type[BaseModel], **_):
        self.calls.append(schema.__name__)
        self.systems.append(system)
        if self.fail:
            raise LLMError("model down")
        if schema is Qualification:
            return self.qualification
        if schema is Reply:
            return self.reply.pop(0) if isinstance(self.reply, list) else self.reply
        if schema is Review:
            return self.review
        if schema is FollowUpEmail:
            return self.email
        if schema is Summary:
            return Summary(summary="Quiet day.")
        raise AssertionError(f"unexpected schema {schema}")

    def embed(self, text):
        raise LLMError("no embeddings in the local test database (pgvector is not installed)")


def make_worker(dsn: str, llm, review_llm=None) -> Worker:
    db = Database(dsn, max_size=2)
    queue = TaskQueue(db, "test-worker", 60)
    ctx = Context(queue=queue, llm=llm, actions=Actions(db), crm=CRM(db), memory=Memory(db, llm), review_llm=review_llm)
    return Worker(ctx, db, {cls.key: cls() for cls in ALL_AGENTS}, poll_seconds=0)


def drain(w: Worker, limit: int = 20) -> int:
    """Runs tasks until the queue is empty; returns how many ran."""
    n = 0
    while n < limit and w.tick():
        n += 1
    return n


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
    # Once a period's work has been queued, the worker doesn't queue it again (live on 17 Oct
    # finished scans were re-queued every tick, about 5,000 times a day).
    seen.clear()
    done: set[str] = set()
    schedule(Q(), at, done)
    schedule(Q(), at, done)
    assert seen.count("daily_summary:2026-10-16") == 1 and seen.count("followups:2026-10-16T18") == 1


def test_daily_summary_is_written_once(test_db):
    # Live on 17 Oct the summary failed on a timestamp in its facts and was retried all evening.
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("""INSERT INTO public."Client Requests" (id, client_name, status, number_of_adults)
                     VALUES ('req-id-009', 'Mia', 'follow_up', 2)""")
    llm = FakeLLM()
    w = make_worker(test_db["agent"], llm)
    for _ in range(2):
        w.ctx.queue.enqueue("manager", "daily_summary", {"day": "2026-10-17"}, priority=1)
        drain(w)
    assert llm.calls.count("Summary") == 1
    with psycopg.connect(test_db["admin"]) as c:
        assert c.execute("SELECT summary FROM public.ai_daily_summaries WHERE day = '2026-10-17'").fetchone()[0] == "Quiet day."
        assert c.execute("SELECT count(*) FROM public.ai_tasks WHERE task_type = 'daily_summary' AND status = 'failed'").fetchone()[0] == 0


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


def test_whatsapp_reply_is_reviewed_then_waits_for_the_owner(test_db):
    conv = _whatsapp_hi(test_db["admin"])
    llm = FakeLLM()
    w = make_worker(test_db["agent"], llm)
    drain(w)  # route_event, handle_inquiry, quality review, manager review
    assert llm.calls == ["Reply", "Review"]
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        action_id, kind, level, status, payload = c.execute(
            "SELECT id, action_type, level, status, payload FROM public.ai_actions WHERE conversation_id = %s", (conv,)).fetchone()
        assert (kind, level, status) == ("message.collect_info", 2, "proposed")
        assert payload["to"] == "94770000000" and "how many" in payload["text"]
        assert c.execute("SELECT decided_by_kind, decision FROM public.ai_approvals WHERE action_id = %s", (action_id,)).fetchone() == ("manager", "approve")
        assert "waiting for you" in c.execute("SELECT title FROM public.ai_notifications WHERE kind = 'approval_needed'").fetchone()[0]

        # The Manager approved it, but while owner_approves_messages is on the owner still decides.
        c.execute("UPDATE public.ai_settings SET customer_messaging_enabled = true")
        try:
            c.execute("SELECT public.ai_begin_action(%s)", (action_id,))
            raise AssertionError("gate let a customer message through without the owner")
        except psycopg.errors.RaiseException as err:
            assert "needs owner approval" in str(err)

        # Once the owner hands routine messages to the Manager, its approval is enough.
        c.execute("UPDATE public.ai_settings SET owner_approves_messages = false")
        assert c.execute("SELECT (public.ai_begin_action(%s)).status", (action_id,)).fetchone()[0] == "executing"


def test_newer_message_replaces_the_unsent_draft(test_db):
    conv = _whatsapp_hi(test_db["admin"])
    w = make_worker(test_db["agent"], FakeLLM())
    drain(w)
    _whatsapp_hi(test_db["admin"], "We are 2 adults in March", "wamid.2")
    drain(w)
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
        assert c.execute("SELECT body FROM public.ai_notifications WHERE kind = 'attention'").fetchone()[0] == \
            'refund request. They wrote: "I want a refund"'


def test_asking_if_human_pings_the_owner(test_db):
    _whatsapp_hi(test_db["admin"], "Is this a real person?")
    w = make_worker(test_db["agent"], FakeLLM(reply=Reply(kind="needs_human", reply="", reason="asked_if_human")))
    for _ in range(2):
        w.tick()
    with psycopg.connect(test_db["admin"]) as c:
        assert c.execute("SELECT count(*) FROM public.ai_actions").fetchone()[0] == 0
        title, body = c.execute("SELECT title, body FROM public.ai_notifications WHERE kind = 'attention'").fetchone()
    assert "real person" in title and "Is this a real person?" in body


def test_complaint_is_not_reported_as_asking_if_human(test_db):
    # The first test drive labelled a complaint "asked_if_human"; the heading follows what the customer wrote.
    _whatsapp_hi(test_db["admin"], "Our driver was 40 minutes late. Not impressed.")
    w = make_worker(test_db["agent"], FakeLLM(reply=Reply(kind="needs_human", reply="", reason="asked_if_human")))
    for _ in range(2):
        w.tick()
    with psycopg.connect(test_db["admin"]) as c:
        title = c.execute("SELECT title FROM public.ai_notifications WHERE kind = 'attention'").fetchone()[0]
        body = c.execute("SELECT body FROM public.ai_notifications WHERE kind = 'attention'").fetchone()[0]
    assert "needs a person" in title and "real person" not in title
    assert body == 'They wrote: "Our driver was 40 minutes late. Not impressed."'


def test_ordinary_enquiry_mislabelled_as_asking_if_human_gets_a_reply(test_db):
    # Live on 17 Oct: "Can i get details about my trip to sri lanka" was handed to the owner as "asked_if_human".
    _whatsapp_hi(test_db["admin"], "Hello\nCan i get details about my trip to sri lanka")
    llm = FakeLLM(reply=[Reply(kind="needs_human", reply="", reason="asked_if_human"),
                         Reply(kind="collect_info", reply="Lovely to hear from you. When are you thinking of travelling?", reason="dates missing")])
    w = make_worker(test_db["agent"], llm)
    for _ in range(2):
        w.tick()
    assert llm.calls.count("Reply") == 2 and "does NOT ask" in llm.systems[-1]
    with psycopg.connect(test_db["admin"]) as c:
        assert c.execute("SELECT count(*) FROM public.ai_notifications WHERE kind = 'attention'").fetchone()[0] == 0
        assert c.execute("SELECT action_type FROM public.ai_actions").fetchone()[0] == "message.collect_info"


def test_pulse_checks_in_while_a_task_is_still_running(test_db, monkeypatch):
    # A reply can take minutes on the CPU; the background pulse keeps every agent online meanwhile.
    import lankalux_agents.worker as worker_mod
    w = make_worker(test_db["agent"], FakeLLM())
    w.stopping = True  # a stop waiting for the current task must not take the agents offline
    calls = []

    class Done(Exception):
        pass

    def sleep(_s):
        calls.append(1)
        if len(calls) > 2:
            raise Done

    monkeypatch.setattr(worker_mod.time, "sleep", sleep)
    with pytest.raises(Done):
        w.pulse()
    with psycopg.connect(test_db["admin"]) as c:
        assert c.execute("SELECT count(*) FROM public.ai_agents WHERE last_heartbeat_at > now() - interval '1 minute'").fetchone()[0] == len(w.agents)


def _chat(admin_dsn: str, messages: list[tuple[str, str]], lead: dict | None = None, name: str = "Nimal") -> str:
    """A WhatsApp chat with history; the last message is the customer's new one."""
    with psycopg.connect(admin_dsn, autocommit=True) as c:
        conv = c.execute("""INSERT INTO public.ai_conversations (channel, external_id, customer_name, last_message_at,
                                                             service_window_expires_at, lead)
                            VALUES ('whatsapp', '94770000001', %s, now(), now() + interval '24 hours', %s) RETURNING id""",
                         (name, psycopg.types.json.Jsonb(lead or {}))).fetchone()[0]
        for i, (who, text) in enumerate(messages):
            inbound = who == "customer"
            msg = c.execute("""INSERT INTO public.ai_messages (conversation_id, direction, sender_kind, body, status, created_at)
                               VALUES (%s, %s, %s, %s, %s, now() - make_interval(mins => %s)) RETURNING id""",
                            (conv, "inbound" if inbound else "outbound", "customer" if inbound else "ai", text,
                             "received" if inbound else "sent", len(messages) - i)).fetchone()[0]
        c.execute("""INSERT INTO public.ai_events (event_type, source_table, source_id, payload, dedupe_key)
                     VALUES ('whatsapp.message_received', 'ai_messages', %s, %s, 'wa:chat')""",
                  (str(msg), psycopg.types.json.Jsonb({"conversation_id": str(conv)})))
    return str(conv)


def _draft(admin_dsn: str, conv: str) -> str | None:
    with psycopg.connect(admin_dsn) as c:
        row = c.execute("SELECT payload->>'text' FROM public.ai_actions WHERE conversation_id = %s AND status = 'proposed'",
                        (conv,)).fetchone()
    return row[0] if row else None


def test_draft_that_reasks_known_details_is_written_again(test_db):
    conv = _chat(test_db["admin"], [("customer", "Hi, 2 adults, 20 to 28 November. No need hotels.")],
                 lead={"dateNotes": "20 to 28 November", "adults": 2, "children": 0, "declined": ["hotels"]})
    llm = FakeLLM(reply=[
        Reply(kind="collect_info", reply="Perfect, I'm excited! When are you planning to travel, and what hotels do you like?", reason="x"),
        Reply(kind="collect_info", reply="Thanks Nimal. What would you most like to do, beaches, wildlife or culture?", reason="x",
              sheet=TripSheet(dateNotes="20 to 28 November", adults=2)),
    ])
    drain(make_worker(test_db["agent"], llm))
    assert llm.calls == ["Reply", "Reply", "Review"]
    assert "already answered" in llm.systems[1] and "sales phrases (i'm excited)" in llm.systems[1]
    assert _draft(test_db["admin"], conv).startswith("Thanks Nimal. What would you most like")
    with psycopg.connect(test_db["admin"]) as c:
        lead = c.execute("SELECT lead FROM public.ai_conversations WHERE id = %s", (conv,)).fetchone()[0]
    assert lead["declined"] == ["hotels"] and lead["adults"] == 2  # kept, and saved by the agent role


def test_repeated_message_is_never_sent(test_db):
    same = "Thanks! Could you tell me what you'd like to see in Sri Lanka?"
    conv = _chat(test_db["admin"], [("customer", "Hi"), ("lankalux", same), ("customer", "ok")])
    llm = FakeLLM(reply=Reply(kind="collect_info", reply=same, reason="x"))
    drain(make_worker(test_db["agent"], llm))
    assert llm.calls == ["Reply", "Reply"]
    assert _draft(test_db["admin"], conv) is None
    with psycopg.connect(test_db["admin"]) as c:
        assert "repeating" in c.execute("SELECT body FROM public.ai_notifications WHERE kind = 'attention'").fetchone()[0]


def test_enough_details_hands_over_for_an_itinerary(test_db):
    conv = _chat(test_db["admin"], [("customer", "2 adults, 20 to 28 November, beaches and wildlife. Give me an itinerary first")])
    sheet = TripSheet(dateNotes="20 to 28 November", adults=2, interests="beaches, wildlife", wantsItinerary=True)
    llm = FakeLLM(reply=Reply(kind="collect_info", reply="Lovely. Which hotels would you like?", reason="x", sheet=sheet))
    drain(make_worker(test_db["agent"], llm))
    assert _draft(test_db["admin"], conv) == HANDED_OVER.format(name=", Nimal")
    with psycopg.connect(test_db["admin"]) as c:
        title, body = c.execute("SELECT title, body FROM public.ai_notifications WHERE title LIKE '%%itinerary%%'").fetchone()
        lead = c.execute("SELECT lead FROM public.ai_conversations WHERE id = %s", (conv,)).fetchone()[0]
    assert title == "Nimal is ready for an itinerary" and "2 adults" in body and "beaches, wildlife" in body
    assert lead["handedOverAt"]


def test_our_own_profile_name_is_not_used_as_the_customer_name():
    assert first_name("LankaLux") is None and first_name("Lanka Lux Tours") is None
    assert first_name("nimal perera") == "Nimal" and first_name("+94 77") is None
