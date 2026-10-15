"""Operations Agent. Phase 6 watches sold bookings, trips and chauffeur assignments."""
from __future__ import annotations

from ..queue import Task
from .base import Agent, Context, Outcome, not_enabled


class OperationsAgent(Agent):
    key = "operations"
    handlers = {"status_changed": "pending", "check_upcoming_trips": "pending"}

    def pending(self, task: Task, ctx: Context) -> Outcome:
        return not_enabled(self.key, task)
