from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg
import pytest
from pydantic import BaseModel

from lankalux_agents.actions import Actions
from lankalux_agents.agents import ALL_AGENTS, Context
from lankalux_agents.agents.winback import PER_WEEK, WinBackEmail
from lankalux_agents.crm import CRM
from lankalux_agents.db import Database
from lankalux_agents.events import schedule
from lankalux_agents.memory import Memory
from lankalux_agents.queue import TaskQueue
from lankalux_agents.worker import Worker

COLOMBO = ZoneInfo("Asia/Colombo")


class FakeLLM:
    def __init__(self):
        self.users: list[str] = []

    def structured(self, system, user, schema: type[BaseModel], **_):
        assert schema is WinBackEmail
        self.users.append(user)
        return WinBackEmail(subject="Still thinking about Sri Lanka?",
                            body="Hi Anna! You asked us about Ella and the tea country — January is lovely there. 🙂\n\n"
                                 "If Sri Lanka is still on your list, we can put a fresh plan together. Would next year suit?")

    def embed(self, text):
        raise AssertionError("not used")


def make_worker(dsn: str, llm) -> Worker:
    db = Database(dsn, max_size=2)
    ctx = Context(queue=TaskQueue(db, "test-worker", 60), llm=llm, actions=Actions(db), crm=CRM(db), memory=Memory(db, llm))
    return Worker(ctx, db, {cls.key: cls() for cls in ALL_AGENTS}, poll_seconds=0)


def drain(w: Worker, limit: int = 60) -> int:
    n = 0
    while n < limit and w.tick():
        n += 1
    return n


def enquiry(c, rid: str, email: str | None, *, days: int = 90, status: str = "expired", name: str = "Anna"):
    c.execute("""INSERT INTO public."Client Requests" (id, client_name, email, status, created_at, interests, requested_destinations)
                 VALUES (%s, %s, %s, %s, now() - make_interval(days => %s), 'tea country', 'Ella')""",
              (rid, name, email, status, days))


def settle(c):
    """Marks the CRM events from test inserts as handled, so only the win-back work runs."""
    c.execute("UPDATE public.ai_events SET processed_at = now() WHERE processed_at IS NULL")


def win_backs(admin: str) -> list[tuple]:
    with psycopg.connect(admin) as c:
        return c.execute("""SELECT request_id, level, status, payload FROM public.ai_actions
                            WHERE action_type = 'message.win_back' ORDER BY request_id""").fetchall()


def scan(test_db, llm=None) -> FakeLLM:
    llm = llm or FakeLLM()
    w = make_worker(test_db["agent"], llm)
    w.ctx.queue.enqueue("winback", "scan_win_backs", {}, priority=1)
    drain(w)
    return llm


# --------------------------------------------------------------------------- plain code


def test_win_back_is_scheduled_on_monday_from_ten():
    class Q:
        def __init__(self):
            self.jobs = []

        def enqueue(self, agent, task_type, payload, **kw):
            self.jobs.append((agent, task_type, kw["dedupe_key"]))

    def jobs(when: datetime):
        q = Q()
        schedule(q, when)
        return [j for j in q.jobs if j[0] == "winback"]

    assert jobs(datetime(2026, 10, 26, 10, 30, tzinfo=COLOMBO)) == [("winback", "scan_win_backs", "winback:2026-W44")]
    assert jobs(datetime(2026, 10, 26, 9, 0, tzinfo=COLOMBO)) == []  # Monday, too early
    assert jobs(datetime(2026, 10, 27, 11, 0, tzinfo=COLOMBO)) == []  # Tuesday


# --------------------------------------------------------------------------- with the database


def test_only_quiet_unbooked_people_get_a_draft_once_per_address(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        enquiry(c, "req-ok", "Anna@Example.com ")
        enquiry(c, "req-ok-older", "anna@example.com", days=200)  # same person: one email, about the latest enquiry
        enquiry(c, "req-new", "new@example.com", days=10)  # too recent
        enquiry(c, "req-old", "old@example.com", days=400)  # too old
        enquiry(c, "req-sold", "sold@example.com", status="sold")
        enquiry(c, "req-cancelled", "cancel@example.com", status="cancelled")
        enquiry(c, "req-no-email", None)
        enquiry(c, "req-booked-later", "booked@example.com")
        enquiry(c, "req-booked-later-2", "booked@example.com", days=40, status="after_sales")  # booked another time
        enquiry(c, "req-talking", "talking@example.com")
        c.execute("""INSERT INTO public.communications (request_id, channel, direction, body, created_at)
                     VALUES ('req-talking', 'email', 'inbound', 'Hello again', now() - interval '3 days')""")
        enquiry(c, "req-opted-out", "gone@example.com")
        c.execute("INSERT INTO public.ai_email_optouts (email) VALUES ('gone@example.com')")
        settle(c)
    llm = scan(test_db)
    rows = win_backs(test_db["admin"])
    assert [r[0] for r in rows] == ["req-ok"]
    rid, level, status, payload = rows[0]
    assert level == 3 and status == "proposed"  # the owner approves each one
    assert payload["to"] == "anna@example.com" and payload["channel"] == "email"
    assert "—" not in payload["body"] and "🙂" not in payload["body"]
    assert "Ella" in llm.users[0]  # the model writes from the enquiry's facts
    with psycopg.connect(test_db["admin"]) as c:
        assert c.execute("""SELECT count(*) FROM public.ai_notifications
                            WHERE kind = 'approval_needed' AND title LIKE 'Win-back email to Anna%%'""").fetchone()[0] == 1

    # Next week: still nothing new for Anna (6 months between win-backs), even once it was sent.
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("UPDATE public.ai_actions SET status = 'executed', created_at = now() - interval '8 days' WHERE action_type = 'message.win_back'")
    scan(test_db)
    assert len(win_backs(test_db["admin"])) == 1


def test_at_most_ten_a_week(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        for i in range(PER_WEEK + 3):
            enquiry(c, f"req-{i:02d}", f"p{i}@example.com", days=40 + i)
        settle(c)
    scan(test_db)
    assert len(win_backs(test_db["admin"])) == PER_WEEK
    scan(test_db)  # a second run the same week adds nothing
    assert len(win_backs(test_db["admin"])) == PER_WEEK


def test_database_refuses_email_to_someone_who_unsubscribed(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        enquiry(c, "req-ok", "anna@example.com")
        settle(c)
    scan(test_db)
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("UPDATE public.ai_settings SET customer_messaging_enabled = true")
        owner = c.execute("INSERT INTO auth.users (email) VALUES ('owner@lankalux.com') RETURNING id").fetchone()[0]
        c.execute("INSERT INTO public.admin_users (user_id, email, role, active) VALUES (%s, 'owner@lankalux.com', 'supervisor', true)", (owner,))
        action_id = c.execute("SELECT id FROM public.ai_actions WHERE action_type = 'message.win_back'").fetchone()[0]
        c.execute("INSERT INTO public.ai_approvals (action_id, decided_by_kind, decided_by, decision) VALUES (%s, 'owner', %s, 'approve')",
                  (action_id, owner))
        # They unsubscribe (from an earlier email) after the owner approved: it must not go out.
        c.execute("INSERT INTO public.ai_email_optouts (email) VALUES ('anna@example.com')")
        with pytest.raises(psycopg.Error, match="unsubscribed"):
            c.execute("SELECT public.ai_begin_action(%s)", (action_id,))
        c.execute("DELETE FROM public.ai_email_optouts")
        assert c.execute("SELECT (public.ai_begin_action(%s)).status", (action_id,)).fetchone()[0] == "executing"


def test_agent_cannot_change_the_unsubscribe_list_or_approve_win_backs(test_db):
    with psycopg.connect(test_db["agent"], autocommit=True) as c:
        assert c.execute("SELECT count(*) FROM public.ai_email_optouts").fetchone()[0] == 0  # may read it
        with pytest.raises(psycopg.Error):
            c.execute("DELETE FROM public.ai_email_optouts")
    with psycopg.connect(test_db["agent"], autocommit=True) as c, pytest.raises(psycopg.Error):
        c.execute("INSERT INTO public.ai_email_optouts (email) VALUES ('x@example.com')")
    with psycopg.connect(test_db["agent"], autocommit=True) as c, pytest.raises(psycopg.Error):
        c.execute("SELECT * FROM public.ai_unsubscribe_tokens")
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        enquiry(c, "req-ok", "anna@example.com")
        settle(c)
    scan(test_db)
    with psycopg.connect(test_db["admin"]) as c:
        action_id = c.execute("SELECT id FROM public.ai_actions WHERE action_type = 'message.win_back'").fetchone()[0]
    with psycopg.connect(test_db["agent"], autocommit=True) as c, pytest.raises(psycopg.Error):
        c.execute("INSERT INTO public.ai_approvals (action_id, decided_by_kind, decision) VALUES (%s, 'manager', 'approve')", (action_id,))


def test_follow_ups_skip_people_who_unsubscribed(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("INSERT INTO public.ai_email_optouts (email) VALUES ('anna@example.com')")
    w = make_worker(test_db["agent"], FakeLLM())
    assert w.ctx.crm.unsubscribed(" Anna@example.com")
    assert not w.ctx.crm.unsubscribed("bob@example.com")


def test_paused_win_back_agent_does_nothing(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        enquiry(c, "req-ok", "anna@example.com")
        settle(c)
        c.execute("UPDATE public.ai_agents SET paused = true WHERE key = 'winback'")
    scan(test_db)
    assert win_backs(test_db["admin"]) == []
