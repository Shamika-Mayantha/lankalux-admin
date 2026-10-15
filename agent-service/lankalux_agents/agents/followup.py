"""Follow-up Agent. Phase 6 turns stale leads into Level 2 follow-up proposals."""
from __future__ import annotations

from ..queue import Task
from .base import Agent, Context, Outcome, not_enabled


class FollowUpAgent(Agent):
    key = "followup"
    handlers = {"scan_follow_ups": "pending"}

    def pending(self, task: Task, ctx: Context) -> Outcome:
        return not_enabled(self.key, task)
