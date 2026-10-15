"""Thin wrappers over the durable task queue in Postgres."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .db import Database, jsonb


@dataclass
class Task:
    id: str
    agent_key: str
    task_type: str
    payload: dict[str, Any]
    request_id: str | None = None
    conversation_id: str | None = None
    depth: int = 0
    attempts: int = 1
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "Task":
        return cls(
            id=str(row["id"]),
            agent_key=row["agent_key"],
            task_type=row["task_type"],
            payload=row.get("payload") or {},
            request_id=row.get("request_id"),
            conversation_id=str(row["conversation_id"]) if row.get("conversation_id") else None,
            depth=row.get("depth", 0),
            attempts=row.get("attempts", 1),
            raw=row,
        )


class TaskQueue:
    def __init__(self, db: Database, worker_id: str, lease_seconds: int):
        self.db = db
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds

    def claim(self, limit: int = 1) -> list[Task]:
        rows = self.db.all("SELECT * FROM public.ai_claim_tasks(%s, %s, %s)", self.worker_id, limit, self.lease_seconds)
        return [Task.from_row(r) for r in rows]

    def complete(self, task: Task, status: str, result: dict | None = None, error: str | None = None,
                 retry_in: int | None = None) -> None:
        self.db.one(
            "SELECT public.ai_complete_task(%s, %s, %s, %s, %s, %s)",
            task.id, self.worker_id, status, jsonb(result) if result is not None else None, error, retry_in,
        )

    def enqueue(self, agent_key: str, task_type: str, payload: dict | None = None, *, request_id: str | None = None,
                parent: Task | None = None, dedupe_key: str | None = None, priority: int = 100,
                conversation_id: str | None = None, event_id: int | None = None, created_by: str = "system") -> str | None:
        """Returns the new task id, or None when a guard (dedupe, depth, rate) declined it."""
        row = self.db.one(
            "SELECT public.ai_enqueue_task(%s, %s, %s, %s, %s, %s, %s, now(), %s, %s, %s) AS id",
            agent_key, task_type, jsonb(payload or {}), request_id, parent.id if parent else None,
            dedupe_key, priority, created_by, conversation_id, event_id,
        )
        return str(row["id"]) if row and row["id"] else None
