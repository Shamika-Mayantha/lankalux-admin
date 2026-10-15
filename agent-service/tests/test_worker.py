from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg
from pydantic import BaseModel

from lankalux_agents.actions import Actions
from lankalux_agents.agents import ALL_AGENTS, Context
from lankalux_agents.agents.manager import ROUTES
from lankalux_agents.agents.sales import Qualification
from lankalux_agents.crm import CRM
from lankalux_agents.db import Database
from lankalux_agents.events import schedule
from lankalux_agents.llm import LLMError
from lankalux_agents.memory import Memory
from lankalux_agents.queue import Task, TaskQueue
from lankalux_agents.worker import Worker


class FakeLLM:
    """Returns canned structured output; records what it was asked."""

    def __init__(self, fail: bool = False):
        self.calls: list[str] = []
        self.fail = fail

    def structured(self, system, user, schema: type[BaseModel], **_):
        self.calls.append(schema.__name__)
        if self.fail:
            raise LLMError("model down")
        if schema is Qualification:
            return Qualification(readiness="needs_info", missing=["children's ages"], note="Family of 3, Feb; ask ages.")
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
