"""Turns captured CRM events into Manager routing tasks, and schedules time-based work.
Both are idempotent: event tasks are deduped by event id, scheduled ones by period."""
from __future__ import annotations

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from .db import Database
from .queue import TaskQueue

log = logging.getLogger(__name__)

COLOMBO = ZoneInfo("Asia/Colombo")
DAILY_SUMMARY_HOUR = 18  # 6pm Sri Lanka time
LEAD_SEARCH_HOURS = (9, 17)  # the Lead Scout searches at 9am and 5pm Sri Lanka time
WIN_BACK_HOUR = 10  # the Win-back agent drafts on Mondays from 10am Sri Lanka time


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


def schedule(queue: TaskQueue, now: datetime | None = None, done: set[str] | None = None) -> None:
    """Queues each period's work once. The database only dedupes tasks still waiting or running,
    so `done` (kept by the worker) stops a finished or failed period being queued again every tick."""
    local = (now or datetime.now(COLOMBO)).astimezone(COLOMBO)
    jobs = []
    if local.hour >= DAILY_SUMMARY_HOUR:
        day = local.date().isoformat()
        jobs.append(("manager", "daily_summary", {"day": day}, f"daily_summary:{day}", 90))
    if 8 <= local.hour < 20:
        stamp = local.strftime("%Y-%m-%dT%H")
        jobs.append(("followup", "scan_follow_ups", {}, f"followups:{stamp}", 120))
        jobs.append(("operations", "check_upcoming_trips", {}, f"trips:{stamp}", 120))
        jobs.append(("partners", "plan_partners", {}, f"partners:{stamp}", 160))
    # A restart late in the day queues both searches; the scout skips one that comes too soon after the other.
    for hour in LEAD_SEARCH_HOURS:
        if local.hour >= hour:
            jobs.append(("scout", "scan_for_leads", {}, f"leads:{local.date().isoformat()}:{hour}", 140))
    if local.weekday() == 0 and local.hour >= WIN_BACK_HOUR:
        year, week, _ = local.isocalendar()
        jobs.append(("winback", "scan_win_backs", {}, f"winback:{year}-W{week:02d}", 150))
    for agent, task_type, payload, key, priority in jobs:
        if done is not None and key in done:
            continue
        try:
            queue.enqueue(agent, task_type, payload, dedupe_key=key, priority=priority)
        except Exception as err:  # e.g. an agent whose database row is not installed yet: skip it, keep the rest
            log.warning("could not schedule %s.%s: %s", agent, task_type, err)
        if done is not None:
            done.add(key)
