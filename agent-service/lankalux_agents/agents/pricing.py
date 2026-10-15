"""Pricing Agent. Phase 6, once verified rates exist in the database. Every quotation it prepares is Level 3 (owner approval)."""
from __future__ import annotations

from ..queue import Task
from .base import Agent, Context, Outcome, not_enabled


class PricingAgent(Agent):
    key = "pricing"
    handlers = {"prepare_quote": "pending"}

    def pending(self, task: Task, ctx: Context) -> Outcome:
        return not_enabled(self.key, task)
