"""Travel Planner. When Sales finds a lead ready (dates, party size and interests known) and the
request has no itinerary yet, it asks for one draft from the EXISTING LankaLux generator
(generateOneItinerary in the console, the same OpenAI prompt and format staff use). It never
writes itineraries itself and never changes their format.

The request is a Level 1 itinerary.generate action; the console's dispatcher runs it through the
database gate and saves the draft as option 1 ("balanced"), exactly like pressing Generate.
Nothing is sent to the customer: staff review and send it as usual."""
from __future__ import annotations

from ..queue import Task
from .base import Agent, Context, Outcome, not_enabled

FILLED = {"draft", "published", "ready", "generated", "legacy"}


class PlannerAgent(Agent):
    key = "planner"
    handlers = {"generate_itinerary": "generate_itinerary", "revise_itinerary": "pending"}

    def pending(self, task: Task, ctx: Context) -> Outcome:
        return not_enabled(self.key, task)

    def generate_itinerary(self, task: Task, ctx: Context) -> Outcome:
        rid = task.request_id
        if not rid:
            return Outcome("failed", error="generate_itinerary needs a request")
        req = ctx.crm.request(rid)
        if not req:
            return Outcome("failed", error=f"request {rid} not found")
        if (req.get("status") or "new") not in ("new", "follow_up"):
            return Outcome("succeeded", {"skipped": True, "reason": f"request is {req.get('status')}"})
        if not req.get("start_date") or not (req.get("number_of_adults") or 0):
            return Outcome("succeeded", {"skipped": True, "reason": "dates or party size missing"})
        if any((o.get("status") or "") in FILLED for o in ctx.crm.itinerary_options(rid)):
            return Outcome("succeeded", {"skipped": True, "reason": "an itinerary already exists"})
        if ctx.crm.recent_actions(rid, "itinerary.generate", 30):
            return Outcome("succeeded", {"skipped": True, "reason": "already requested"})
        who = req.get("client_name") or rid
        action = ctx.actions.propose(
            agent_key=self.key, action_type="itinerary.generate", task_id=task.id, request_id=rid,
            summary=f"Draft itinerary for {who}", reasoning="The lead has dates, party size and interests.",
            payload={"option": 1, "style": "balanced"},
        )
        return Outcome("succeeded", {"action_id": str(action["id"])})
