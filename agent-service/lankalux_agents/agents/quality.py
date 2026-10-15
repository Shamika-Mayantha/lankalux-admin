"""Quality Agent. Phase 6 reviews itineraries and drafts against business rules; its findings feed the Manager's Level 2 review."""
from __future__ import annotations

from ..queue import Task
from .base import Agent, Context, Outcome, not_enabled


class QualityAgent(Agent):
    key = "quality"
    handlers = {"review_itinerary": "pending", "review_draft": "pending"}

    def pending(self, task: Task, ctx: Context) -> Outcome:
        return not_enabled(self.key, task)
