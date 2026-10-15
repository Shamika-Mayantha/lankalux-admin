"""Sales Agent. Phase 1 qualifies new leads internally (a Level 1 note for staff).
Customer conversations (WhatsApp) arrive in Phase 8 and stay behind the
customer-messaging switch, which is off by default."""
from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ..queue import Task
from .base import AI_DISCLOSURE, Agent, Context, Outcome, not_enabled

QUALIFY_PROMPT = """You help the LankaLux sales team. From the enquiry facts, list which travel details
are still missing for a tailor-made itinerary (dates, party size, children's ages, interests,
destinations, hotel level, budget, arrival/departure flights) and rate how ready the lead is.
Do not invent details the customer did not give. Write for staff, in plain English."""


class Qualification(BaseModel):
    readiness: str = Field(pattern="^(ready|needs_info|unclear)$")
    missing: list[str] = Field(default_factory=list, max_length=10)
    note: str = Field(max_length=800)
    escalate: bool = False
    escalate_reason: str | None = Field(default=None, max_length=300)


class SalesAgent(Agent):
    key = "sales"
    handlers = {"qualify_lead": "qualify_lead", "handle_inquiry": "handle_inquiry"}
    disclosure = AI_DISCLOSURE

    def qualify_lead(self, task: Task, ctx: Context) -> Outcome:
        if not task.request_id:
            return Outcome("failed", error="qualify_lead needs a request")
        req = ctx.crm.request(task.request_id)
        if not req:
            return Outcome("failed", error=f"request {task.request_id} not found")
        facts = {"request": req, "messages": ctx.crm.recent_communications(task.request_id, 5)}
        q = ctx.llm.structured(self.system_prompt(ctx, QUALIFY_PROMPT), json.dumps(facts, default=str), Qualification)

        action = ctx.actions.propose(
            agent_key=self.key, action_type="crm.add_note", task_id=task.id, request_id=task.request_id,
            summary=f"Lead check: {q.readiness}", payload={"note": q.note, "missing": q.missing},
        )
        ran = ctx.actions.try_run_crm(str(action["id"]))
        if q.escalate:
            ctx.actions.notify_owner("attention", f"Lead {req.get('client_name') or task.request_id} needs a look",
                                     q.escalate_reason or q.note, request_id=task.request_id)
        return Outcome("succeeded", {"readiness": q.readiness, "missing": q.missing, "noted": ran is not None})

    def handle_inquiry(self, task: Task, ctx: Context) -> Outcome:
        # Phase 8: WhatsApp/email replies. Until then the inbound message is left for staff.
        return not_enabled(self.key, task)
