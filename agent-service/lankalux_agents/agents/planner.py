"""Travel Planner. Phase 6 calls the EXISTING admin generator (generateOneItinerary via a signed admin route) and never changes the itinerary format."""
from __future__ import annotations

from ..queue import Task
from .base import Agent, Context, Outcome, not_enabled


class PlannerAgent(Agent):
    key = "planner"
    handlers = {"generate_itinerary": "pending", "revise_itinerary": "pending"}

    def pending(self, task: Task, ctx: Context) -> Outcome:
        return not_enabled(self.key, task)
