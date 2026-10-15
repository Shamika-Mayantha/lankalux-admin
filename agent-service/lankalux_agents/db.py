"""Database access as the restricted lankalux_agent role.

Every write the agents make goes through the SQL functions in the AI migration
(ai_enqueue_task, ai_claim_tasks, ai_execute_crm_action, ...). This module never
holds the Supabase service-role key.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool


class Database:
    def __init__(self, url: str, max_size: int = 4):
        # Session-mode pooler connections; small pool, the VM runs one worker.
        self.pool = ConnectionPool(url, min_size=1, max_size=max_size, kwargs={"row_factory": dict_row}, open=True)

    @contextmanager
    def tx(self) -> Iterator[Any]:
        with self.pool.connection() as conn:
            with conn.transaction():
                yield conn

    def one(self, sql: str, *params: Any) -> dict | None:
        with self.tx() as conn:
            return conn.execute(sql, params).fetchone()

    def all(self, sql: str, *params: Any) -> list[dict]:
        with self.tx() as conn:
            return conn.execute(sql, params).fetchall()

    def close(self) -> None:
        self.pool.close()


def jsonb(value: Any) -> Jsonb:
    return Jsonb(value)
