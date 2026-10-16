"""AI General Manager: routes events, reviews Level 2 actions, writes the daily summary.

Routing is deterministic (a table, not the model), so an odd model reply can never send
work somewhere unexpected. The model is used for judgement: reviews and summaries.
"""
from __future__ import annotations

import json
from datetime import date

from pydantic import BaseModel, Field

from ..db import jsonb
from ..queue import Task
from .base import Agent, Context, Outcome

# event_type -> (agent, task_type, priority). Lower priority runs first.
ROUTES: dict[str, tuple[str, str, int]] = {
    "lead.created": ("sales", "qualify_lead", 50),
    "inquiry.received": ("sales", "handle_inquiry", 20),
    "whatsapp.message_received": ("sales", "handle_inquiry", 20),
    "lead.updated": ("sales", "qualify_lead", 80),
    "itinerary.changed": ("quality", "review_itinerary", 60),
    "lead.status_changed": ("operations", "status_changed", 70),
}

MANAGER_PROMPT = """You are the AI General Manager of LankaLux, a small, premium Sri Lankan private-chauffeur
and tailor-made travel company. Specialist agents send you their drafts; you decide what happens next.
The owner trusts you to handle routine work without them, and wants to be pinged only when it matters.
Judge only from the facts given (the draft, the conversation or lead, and the Quality findings).

Decide:
- "approve": a routine, accurate, warm reply or follow-up that answers what the customer said, asks for
  sensible missing details, invents nothing, and follows the rules. Most everyday messages are this.
- "escalate": the owner should look. Use it when the customer is unhappy, complaining or hesitant about
  money; asks about prices, discounts, payments, refunds, cancellations or an existing booking; has an
  unusual request (very large group, VIP, medical, accessibility, safety, legal); the draft misreads the
  customer or might embarrass LankaLux; or you are not sure.
  Also escalate when the draft asks for something the customer already gave (for example asks about
  children when they said "2 adults"), ignores a question the customer asked, or when a Quality note
  points to a real problem.
- "reject": the draft is wrong or unsuitable and should not be sent at all (it will also be shown to the owner).
Never approve anything that quotes or estimates prices, promises availability, offers discounts, confirms
bookings, takes payments, or claims to be a human. Explain your decision in one or two plain sentences
written for the owner."""

SUMMARY_PROMPT = """You are the AI General Manager of LankaLux. Write the owner's daily summary from
the JSON facts given. Use only those numbers and names; if something is zero, say so plainly.
Lead with what needs the owner's attention. Keep it under 150 words."""


class Review(BaseModel):
    decision: str = Field(pattern="^(approve|escalate|reject)$")
    reason: str = Field(max_length=600)


class Summary(BaseModel):
    summary: str = Field(max_length=2000)
    attention: list[str] = Field(default_factory=list, max_length=10)


class ManagerAgent(Agent):
    key = "manager"
    uses_playbook = True
    handlers = {
        "route_event": "route_event",
        "review_action": "review_action",
        "daily_summary": "daily_summary",
    }

    def route_event(self, task: Task, ctx: Context) -> Outcome:
        ev = task.payload
        route = ROUTES.get(ev.get("event_type", ""))
        if not route:
            return Outcome("succeeded", {"routed": False, "reason": "no route"})
        agent, task_type, priority = route
        new_id = ctx.queue.enqueue(
            agent, task_type, {"event": ev}, request_id=task.request_id, parent=task,
            dedupe_key=f"{task_type}:{task.request_id or ev.get('source_id')}:{ev.get('id')}",
            priority=priority, event_id=ev.get("id"), created_by="manager",
        )
        return Outcome("succeeded", {"routed": bool(new_id), "to": f"{agent}.{task_type}", "task_id": new_id})

    def review_action(self, task: Task, ctx: Context) -> Outcome:
        """Level 2 review. The database refuses a manager decision on anything else."""
        action = task.payload["action"]
        current = ctx.crm.action(action["id"])
        if not current or current["status"] != "proposed":
            return Outcome("succeeded", {"skipped": True, "reason": "no longer waiting"})
        conversation = None
        if action.get("conversation_id"):
            conversation = [{"from": "customer" if m["direction"] == "inbound" else "lankalux", "text": m["body"]}
                            for m in ctx.crm.conversation_messages(action["conversation_id"], 10)]
        facts = {
            "draft": action,
            "conversation": conversation,
            "lead": ctx.crm.request(action["request_id"]) if action.get("request_id") else None,
            "quality_findings": task.payload.get("quality"),
            "past_corrections": ctx.memory.recall(action.get("summary", ""), limit=3),
        }
        review = ctx.llm.structured(
            self.system_prompt(ctx, MANAGER_PROMPT), json.dumps(facts, default=str), Review
        )
        customer_facing = action["action_type"].startswith("message.")
        if review.decision == "approve":
            ctx.actions.manager_decision(action["id"], "approve", review.reason)
            if customer_facing and ctx.crm.settings().get("owner_approves_messages", True):
                ctx.actions.notify_owner(
                    "approval_needed", f"{action['summary']}: the AI Manager approved it, waiting for you", review.reason,
                    request_id=action.get("request_id"), action_id=action["id"],
                )
        elif review.decision == "reject" and not customer_facing:
            ctx.actions.manager_decision(action["id"], "reject", review.reason)
        else:
            # "revise" leaves the action open, so the owner can still approve or edit it.
            ctx.actions.manager_decision(action["id"], "revise", review.reason)
            verdict = "flagged" if review.decision == "escalate" else "would not send"
            ctx.actions.notify_owner(
                "approval_needed", f"{action['summary']}: the AI Manager {verdict} it", review.reason,
                request_id=action.get("request_id"), action_id=action["id"],
            )
        return Outcome("succeeded", {"decision": review.decision, "reason": review.reason})

    def daily_summary(self, task: Task, ctx: Context) -> Outcome:
        facts = ctx.crm.day_stats()
        facts["stale_follow_ups"] = ctx.crm.stale_follow_ups(limit=10)
        out = ctx.llm.structured(SUMMARY_PROMPT, json.dumps(facts, default=str), Summary, temperature=0.3)
        day = task.payload.get("day") or date.today().isoformat()
        ctx.actions.db.one(
            "INSERT INTO public.ai_daily_summaries (day, summary, stats) VALUES (%s, %s, %s) ON CONFLICT (day) DO NOTHING RETURNING day",
            day, out.summary, jsonb(facts),
        )
        ctx.actions.notify_owner("summary", f"Daily summary {day}", out.summary)
        return Outcome("succeeded", {"day": day, "attention": out.attention})
