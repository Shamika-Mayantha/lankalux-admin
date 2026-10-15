"""Turns captured CRM events into Manager routing tasks, and schedules time-based work.
Both are idempotent: event tasks are deduped by event id, scheduled ones by period."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from .db import Database
from .queue import TaskQueue

COLOMBO = ZoneInfo("Asia/Colombo")
DAILY_SUMMARY_HOUR = 18  # 6pm Sri Lanka time


def pump_events(db: Database, queue: TaskQueue, limit: int = 50) -> int:
    rows = db.all(
        "SELECT id, event_type, source_table, source_id, request_id, payload FROM public.ai_events "
        "WHERE processed_at IS NULL ORDER BY id LIMIT %s",
        limit,
    )
    for ev in rows:
        queue.enqueue(
            "manager", "route_event", {**ev, "id": ev["id"]}, request_id=ev["request_id"],
            dedupe_key=f"event:{ev['id']}", priority=10, event_id=ev["id"], created_by="events",
        )
        db.one("UPDATE public.ai_events SET processed_at = now() WHERE id = %s RETURNING id", ev["id"])
    return len(rows)


def schedule(queue: TaskQueue, now: datetime | None = None) -> None:
    local = (now or datetime.now(COLOMBO)).astimezone(COLOMBO)
    if local.hour >= DAILY_SUMMARY_HOUR:
        day = local.date().isoformat()
        queue.enqueue("manager", "daily_summary", {"day": day}, dedupe_key=f"daily_summary:{day}", priority=90)
    if 8 <= local.hour < 20:
        stamp = local.strftime("%Y-%m-%dT%H")
        queue.enqueue("followup", "scan_follow_ups", {}, dedupe_key=f"followups:{stamp}", priority=120)
        queue.enqueue("operations", "check_upcoming_trips", {}, dedupe_key=f"trips:{stamp}", priority=120)
