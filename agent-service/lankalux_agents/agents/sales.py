"""Sales Agent. Qualifies new leads internally (a Level 1 note for staff) and drafts
WhatsApp replies. A draft is only a proposed action: the database gate requires the
owner's approval and the customer-messaging switch before the sender may deliver it."""
from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ..queue import Task
from .base import AI_DISCLOSURE, Agent, Context, Outcome

QUALIFY_PROMPT = """You help the LankaLux sales team. From the enquiry facts, list which travel details
are still missing for a tailor-made itinerary (dates, party size, children's ages, interests,
destinations, hotel level, budget, arrival/departure flights) and rate how ready the lead is.
Do not invent details the customer did not give. Write for staff, in plain English."""


REPLY_PROMPT = AI_DISCLOSURE + """

You are answering a customer on WhatsApp. Read the conversation and write the next reply.
Rules:
- Be warm, short and clear (WhatsApp style, at most about 80 words). Reply in the customer's language.
- Do not introduce yourself; the system adds the AI concierge introduction to the first message.
- Never quote or estimate prices, promise availability, offer discounts, confirm bookings or take
  payments. Say the team will prepare a tailor-made proposal.
- To plan a tour we need: travel dates or month, number of adults and children (and ages), interests,
  places they want to see, and hotel level. Ask for what is still missing, at most two things at a time.
- Use only facts from the conversation. Do not invent details.
Choose kind:
- "collect_info" when you are mainly asking for missing travel details;
- "routine_reply" for any other simple, friendly answer;
- "needs_human" for complaints, cancellations, refunds, payments, safety, legal or medical issues,
  anything about an existing booking, or anything you are unsure about. Then leave reply empty."""


class Reply(BaseModel):
    kind: str = Field(pattern="^(routine_reply|collect_info|needs_human)$")
    reply: str = Field(default="", max_length=1000)
    reason: str = Field(max_length=300)


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
        ev = task.payload.get("event") or {}
        conversation_id = (ev.get("payload") or {}).get("conversation_id")
        if ev.get("event_type") != "whatsapp.message_received" or not conversation_id:
            return Outcome("succeeded", {"skipped": True, "reason": "only WhatsApp conversations are handled"})
        conv = ctx.crm.conversation(conversation_id)
        if not conv:
            return Outcome("failed", error=f"conversation {conversation_id} not found")
        if conv["mode"] != "ai":
            return Outcome("succeeded", {"skipped": True, "reason": "a person has taken over this conversation"})

        history = ctx.crm.conversation_messages(conversation_id)
        if not history or history[-1]["direction"] != "inbound":
            return Outcome("succeeded", {"skipped": True, "reason": "nothing new from the customer"})
        facts = {
            "customer_name": conv.get("customer_name"),
            "conversation": [{"from": "customer" if m["direction"] == "inbound" else "lankalux", "text": m["body"]}
                             for m in history],
            "lead": ctx.crm.request(conv["request_id"]) if conv.get("request_id") else None,
        }
        r = ctx.llm.structured(self.system_prompt(ctx, REPLY_PROMPT), json.dumps(facts, default=str), Reply)
        who = conv.get("customer_name") or f"+{conv['external_id']}"

        if r.kind == "needs_human" or not r.reply.strip():
            ctx.actions.notify_owner("attention", f"WhatsApp from {who} needs a person", r.reason,
                                     request_id=conv.get("request_id"))
            return Outcome("succeeded", {"kind": "needs_human", "reason": r.reason})

        replaced = ctx.actions.cancel_open_messages(conversation_id, self.key)
        action = ctx.actions.propose(
            agent_key=self.key, action_type=f"message.{r.kind}", task_id=task.id,
            request_id=conv.get("request_id"), conversation_id=conversation_id,
            summary=f"WhatsApp reply to {who}", reasoning=r.reason,
            payload={"text": r.reply.strip(), "to": conv["external_id"], "customer_said": history[-1]["body"]},
        )
        ctx.actions.notify_owner("approval_needed", f"WhatsApp reply to {who} is waiting for you", r.reply.strip(),
                                 request_id=conv.get("request_id"), action_id=str(action["id"]))
        return Outcome("succeeded", {"kind": r.kind, "action_id": str(action["id"]), "replaced": replaced})
