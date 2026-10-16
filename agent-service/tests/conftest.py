"""Integration fixtures: a throwaway database with the Supabase stub and the AI
migration, and a connection as the restricted lankalux_agent role.

Set PG_TEST_ADMIN_DSN (a superuser DSN on a scratch server, e.g.
"host=/var/tmp/pgtest port=55432 user=postgres") to run them; otherwise they skip.
"""
from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

import psycopg
import pytest

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = [ROOT.parent / "supabase" / "migrations" / name
              for name in ("20261016000000_ai_agent_system.sql", "20261016100000_ai_whatsapp_replies.sql",
                           "20261016200000_ai_autonomy.sql", "20261016220000_ai_playbook.sql")]
STUB = ROOT / "tests" / "sql" / "supabase_stub.sql"


def _local_migration() -> str:
    sql = "\n".join(m.read_text() for m in MIGRATIONS)
    sql = re.sub(r"^CREATE EXTENSION IF NOT EXISTS vector.*$", "", sql, flags=re.M)
    sql = sql.replace("extensions.vector(768)", "real[]")
    sql = re.sub(r"CREATE INDEX IF NOT EXISTS ai_memory_embedding_idx[^;]*;", "", sql, flags=re.S)
    return sql


@pytest.fixture(scope="session")
def admin_dsn() -> str:
    dsn = os.environ.get("PG_TEST_ADMIN_DSN")
    if not dsn:
        pytest.skip("PG_TEST_ADMIN_DSN not set")
    return dsn


@pytest.fixture()
def test_db(admin_dsn: str):
    name = f"ai_py_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(admin_dsn, autocommit=True) as c:
        c.execute(f"CREATE DATABASE {name}")
    dsn = f"{admin_dsn} dbname={name}"
    with psycopg.connect(dsn, autocommit=True) as c:
        stub = STUB.read_text()
        exists = c.execute("SELECT 1 FROM pg_roles WHERE rolname = 'anon'").fetchone()
        if exists:
            stub = re.sub(r"^CREATE ROLE anon.*$", "", stub, flags=re.M)
        c.execute(stub)
        c.execute(_local_migration())
        c.execute("ALTER ROLE lankalux_agent LOGIN")
        c.execute("UPDATE public.ai_settings SET system_paused = false")
    yield {"admin": dsn, "agent": f"{dsn} user=lankalux_agent"}
    with psycopg.connect(admin_dsn, autocommit=True) as c:
        c.execute(f"DROP DATABASE {name} WITH (FORCE)")


@pytest.fixture(autouse=True)
def no_clock(monkeypatch):
    """Scheduled work (daily summary, hourly scans) depends on the time of day; tests enqueue it explicitly."""
    monkeypatch.setattr("lankalux_agents.worker.schedule", lambda queue, *a, **k: None)
