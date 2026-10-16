"""The autonomous agents: Quality and Manager review, Follow-up, Operations, Travel Planner, Pricing."""
from __future__ import annotations

import psycopg
import pytest

from lankalux_agents.agents.manager import Review
from lankalux_agents.agents.pricing import parse_price, price_guide
from lankalux_agents.agents.quality import asked_if_human, check_text, tidy_email_body, tidy_message
from lankalux_agents.agents.sales import Qualification, Reply
from test_worker import FakeLLM, _whatsapp_hi, drain, make_worker


def _run(w, agent: str, task_type: str, request_id: str | None = None, key: str = "t1"):
    w.ctx.queue.enqueue(agent, task_type, {}, request_id=request_id, dedupe_key=f"test:{task_type}:{key}", created_by="test")
    return drain(w)


def _one(dsn: str, sql: str, *args):
    with psycopg.connect(dsn) as c:
        return c.execute(sql, args).fetchone()


def _all(dsn: str, sql: str, *args):
    with psycopg.connect(dsn) as c:
        return c.execute(sql, args).fetchall()


# --- Quality ------------------------------------------------------------------------------

def test_quality_rules():
    assert check_text("Lovely! When would you like to travel?") == ([], [])
    hard, _ = check_text("The trip is 660 USD for both of you.")
    assert any("price" in h for h in hard)
    hard, _ = check_text("Great news, I have booked your hotel and you get a 10% discount.")
    assert any("Promises" in h for h in hard)
    hard, _ = check_text("Yes, I'm a real person here in Colombo.")
    assert any("human" in h for h in hard)
    _, soft = check_text("As an AI I can help with that.")
    assert soft


def test_quality_lessons_from_the_first_test_drive():
    # Saying sightings aren't guaranteed is honest, not a promise (curly apostrophe as the model writes it).
    assert check_text("Yala can be intense, and sightings aren\u2019t guaranteed.") == ([], [])
    assert check_text("Whale watching is never guaranteed.") == ([], [])
    assert check_text("We guarantee you'll see a leopard.")[0]
    assert "Uses emojis." in check_text("Hi Mark! \U0001F60A")[1]
    assert tidy_message("Hi Mark! \U0001F60A What's your top interest? \U0001F33F") == "Hi Mark! What's your top interest?"
    assert tidy_email_body("Hi David,\n\nYour trip sounds lovely.\n\nShall we adjust it?\n\nWarm regards\nLankaLux") == \
        "Your trip sounds lovely.\n\nShall we adjust it?"
    assert asked_if_human("Hi, quick one, am I talking to a real person or a bot?")
    assert asked_if_human("is this a bot?")
    assert not asked_if_human("Our driver was 40 minutes late and nobody answered the phone.")


def test_price_in_a_reply_goes_to_the_owner_not_the_manager(test_db):
    _whatsapp_hi(test_db["admin"], "How much is it?")
    llm = FakeLLM(reply=Reply(kind="routine_reply", reply="It would be about 900 USD for 7 days.", reason="price asked"))
    drain(make_worker(test_db["agent"], llm))
    assert "Review" not in llm.calls  # the Manager never saw it
    title, body = _one(test_db["admin"], "SELECT title, body FROM public.ai_notifications WHERE kind = 'approval_needed'")
    assert title.startswith("Please check") and "price" in body
    assert _one(test_db["admin"], "SELECT count(*) FROM public.ai_approvals")[0] == 0


# --- Manager ------------------------------------------------------------------------------

def test_manager_escalation_keeps_the_message_for_the_owner(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("UPDATE public.ai_settings SET owner_approves_messages = false, customer_messaging_enabled = true")
    _whatsapp_hi(test_db["admin"], "I'm not happy with the last driver")
    llm = FakeLLM(review=Review(decision="escalate", reason="The customer is unhappy; you should reply."))
    drain(make_worker(test_db["agent"], llm))
    action_id, = _one(test_db["admin"], "SELECT id FROM public.ai_actions")
    assert _one(test_db["admin"], "SELECT decided_by_kind, decision FROM public.ai_approvals") == ("manager", "revise")
    assert "flagged" in _one(test_db["admin"], "SELECT title FROM public.ai_notifications WHERE kind = 'approval_needed'")[0]
    with psycopg.connect(test_db["admin"], autocommit=True) as c, pytest.raises(psycopg.errors.RaiseException):
        c.execute("SELECT public.ai_begin_action(%s)", (action_id,))


def test_manager_approval_needs_no_owner_ping_in_manager_mode(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("UPDATE public.ai_settings SET owner_approves_messages = false, customer_messaging_enabled = true")
    _whatsapp_hi(test_db["admin"])
    drain(make_worker(test_db["agent"], FakeLLM()))
    action_id, = _one(test_db["admin"], "SELECT id FROM public.ai_actions")
    assert _one(test_db["admin"], "SELECT count(*) FROM public.ai_notifications")[0] == 0
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        assert c.execute("SELECT (public.ai_begin_action(%s)).status", (action_id,)).fetchone()[0] == "executing"


def test_manager_cannot_approve_level_3(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        action_id = c.execute("""INSERT INTO public.ai_actions (agent_key, action_type, level, summary)
                                 VALUES ('pricing', 'quote.final', 3, 'Quote') RETURNING id""").fetchone()[0]
    with psycopg.connect(test_db["agent"], autocommit=True) as c, pytest.raises(psycopg.Error):
        c.execute("INSERT INTO public.ai_approvals (action_id, decided_by_kind, decision) VALUES (%s, 'manager', 'approve')", (action_id,))


# --- Follow-up ----------------------------------------------------------------------------

def _quiet_lead(admin: str, rid: str = "req-fu-1", email: str | None = "anna@example.com"):
    with psycopg.connect(admin, autocommit=True) as c:
        c.execute("""INSERT INTO public."Client Requests" (id, client_name, email, status, created_at, start_date, number_of_adults)
                     VALUES (%s, 'Anna', %s, 'follow_up', now() - interval '10 days', current_date + 60, 2)""", (rid, email))
        c.execute("""INSERT INTO public.communications (request_id, channel, direction, subject, body, created_at)
                     VALUES (%s, 'email', 'outbound', 'Your itinerary', 'Here it is', now() - interval '5 days')""", (rid,))


def test_follow_up_is_drafted_reviewed_and_not_repeated(test_db):
    _quiet_lead(test_db["admin"])
    llm = FakeLLM()
    w = make_worker(test_db["agent"], llm)
    drain(w)  # the new-lead event first
    llm.calls.clear()
    _run(w, "followup", "scan_follow_ups")
    assert llm.calls == ["FollowUpEmail", "Review"]
    kind, level, payload = _one(test_db["admin"], "SELECT action_type, level, payload FROM public.ai_actions WHERE agent_key = 'followup'")
    assert (kind, level, payload["channel"], payload["to"]) == ("message.follow_up", 2, "email", "anna@example.com")
    assert payload["subject"] and payload["body"]
    assert _one(test_db["admin"], "SELECT decision FROM public.ai_approvals ap JOIN public.ai_actions a ON a.id = ap.action_id WHERE a.agent_key = 'followup'")[0] == "approve"
    _run(w, "followup", "scan_follow_ups", key="t2")
    assert _one(test_db["admin"], "SELECT count(*) FROM public.ai_actions WHERE action_type = 'message.follow_up'")[0] == 1


def test_follow_up_limits(test_db):
    _quiet_lead(test_db["admin"], "req-fu-2")
    _quiet_lead(test_db["admin"], "req-fu-3", email=None)
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        for days in (12, 8):
            c.execute("""INSERT INTO public.ai_actions (agent_key, action_type, level, request_id, summary, created_at)
                         VALUES ('followup', 'message.follow_up', 2, 'req-fu-2', 'x', now() - make_interval(days => %s))""", (days,))
        c.execute("UPDATE public.ai_actions SET status = 'executed' WHERE request_id = 'req-fu-2'")
    llm = FakeLLM()
    _run(make_worker(test_db["agent"], llm), "followup", "scan_follow_ups")
    assert "FollowUpEmail" not in llm.calls  # twice already, and no email address
    assert _one(test_db["admin"], "SELECT count(*) FROM public.ai_actions WHERE action_type = 'message.follow_up' AND status = 'proposed'")[0] == 0


# --- Operations ---------------------------------------------------------------------------

def test_operations_flags_missing_driver_once_a_day(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("""INSERT INTO public."Client Requests" (id, client_name, status, start_date, arrival_flight, assigned_vehicle_id)
                     VALUES ('req-op-1', 'Ravi', 'sold', current_date + 3, 'UL 504', 'v1')""")
    w = make_worker(test_db["agent"], FakeLLM())
    _run(w, "operations", "check_upcoming_trips")
    _run(w, "operations", "check_upcoming_trips", key="t2")
    rows = _all(test_db["admin"], "SELECT title FROM public.ai_notifications WHERE kind = 'attention'")
    assert len(rows) == 1
    assert "Ravi" in rows[0][0] and "a chauffeur" in rows[0][0] and "a chosen itinerary" in rows[0][0]
    assert "vehicle" not in rows[0][0] and "flight" not in rows[0][0]


# --- Travel Planner and Pricing -----------------------------------------------------------

def _ready_lead(admin: str, rid: str, legacy: str | None = None):
    with psycopg.connect(admin, autocommit=True) as c:
        c.execute("""INSERT INTO public."Client Requests" (id, client_name, status, start_date, number_of_adults, duration, itineraryoptions)
                     VALUES (%s, 'Mia', 'follow_up', current_date + 40, 2, '7 days', %s)""", (rid, legacy))
        for i, price in enumerate(["Total Price: 700 USD", "USD 1400", "1050"]):
            c.execute("""INSERT INTO public."Client Requests" (id, status, duration, sold_price)
                         VALUES (%s, 'sold', %s, %s)""", (f"{rid}-sold-{i}", ["7 days", "14 days", "10 days"][i], price))


def test_ready_lead_gets_an_itinerary_request_and_a_price_guide(test_db):
    _ready_lead(test_db["admin"], "req-pl-1")
    llm = FakeLLM(qualification=Qualification(readiness="ready", missing=[], note="Ready: 2 adults, 7 days."))
    drain(make_worker(test_db["agent"], llm))
    rows = dict(_all(test_db["admin"], "SELECT action_type, status FROM public.ai_actions WHERE agent_key IN ('planner', 'pricing')"))
    assert rows == {"itinerary.generate": "proposed", "crm.add_note": "executed"}
    note = _one(test_db["admin"], "SELECT detail->>'note' FROM public.activity_logs WHERE actor = 'ai:pricing'")[0]
    assert "100 USD per day" in note and "700 USD" in note and "Internal guide only" in note


def test_planner_skips_a_request_that_already_has_an_itinerary(test_db):
    _ready_lead(test_db["admin"], "req-pl-2", legacy='[{"title": "Old option"}]')
    llm = FakeLLM(qualification=Qualification(readiness="ready", missing=[], note="Ready."))
    drain(make_worker(test_db["agent"], llm))
    assert _one(test_db["admin"], "SELECT count(*) FROM public.ai_actions WHERE action_type = 'itinerary.generate'")[0] == 0


def test_price_parsing_and_thin_data():
    assert parse_price("Total Price: 660 USD") == (660.0, "USD")
    assert parse_price("GBP 1,200") == (1200.0, "GBP")
    assert parse_price("tbc") is None
    line, stats = price_guide([{"sold_price": "500 USD", "duration": "5 days"}], 7)
    assert stats["samples"] == 1 and "not enough" in line


# --- Playbook -----------------------------------------------------------------------------

def test_playbook_reaches_customer_facing_prompts(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        assert "LANKALUX PLAYBOOK" in c.execute("SELECT playbook FROM public.ai_settings").fetchone()[0]
        c.execute("UPDATE public.ai_settings SET playbook = 'PLAYBOOK: we never say cheap.'")
    _whatsapp_hi(test_db["admin"])
    llm = FakeLLM()
    w = make_worker(test_db["agent"], llm)
    w.heartbeat()
    drain(w)
    assert llm.calls == ["Reply", "Review"]
    assert all("we never say cheap" in s for s in llm.systems)  # Sales and the Manager


def test_agent_cannot_edit_the_playbook(test_db):
    with psycopg.connect(test_db["agent"], autocommit=True) as c, pytest.raises(psycopg.Error):
        c.execute("UPDATE public.ai_settings SET playbook = 'be pushy'")


def test_testdrive_runs_every_scenario_without_a_database():
    from lankalux_agents.testdrive import CHATS, run
    llm = FakeLLM()
    llm.model = "fake"
    report = run(llm, "PLAYBOOK: test")
    text = "\n".join(report.lines)
    assert report.summary == {"approved": len(CHATS), "escalated": 0, "to_owner": 0, "errors": 0}
    assert "Playbook loaded" in text and "Follow-up email" in text and "Readiness:" in text
    assert all("PLAYBOOK: test" in s for s in llm.systems)
