"""Sales Agent. Qualifies new leads internally (a Level 1 note for staff) and drafts
WhatsApp replies. A draft is only a proposed Level 2 action: the Quality Agent checks it,
the AI Manager approves it (or pings the owner), and the database gate still requires the
customer-messaging switch, and the owner's approval while the owner approves messages."""
from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ..queue import Task
from .base import AI_DISCLOSURE, Agent, Context, Outcome, request_review
from .quality import asked_if_human, tidy_message

QUALIFY_PROMPT = """You help the LankaLux sales team. From the enquiry facts, list which travel details
are still missing for a tailor-made itinerary (dates, party size, children's ages, interests,
destinations, hotel level, budget, arrival/departure flights) and rate how ready the lead is.
Do not invent details the customer did not give. Write for staff, in plain English."""


REPLY_PROMPT = AI_DISCLOSURE + """

You are chatting with a customer on WhatsApp for LankaLux, the way a friendly, experienced Sri Lankan
travel sales consultant would. Read the conversation and write the next message.
Voice:
- Natural and warm, like a real person texting: short sentences, contractions, the customer's name
  when you know it, no emojis, no bullet lists, no corporate phrases ("I hope this message
  finds you well"), and never "As an AI" or talk about being an assistant. Reply in the customer's language.
- Show genuine enthusiasm for Sri Lanka with a concrete touch (a place, an experience) when it fits.
- If the customer asked a question, answer it first, honestly and specifically, using the playbook.
- Keep it to about 2-4 sentences and end with one easy question that moves towards a tailor-made trip.
- Do not introduce yourself and do not mention AI, bots, assistants or automation.
- If the customer asks whether they are talking to a real person, a bot or an AI, do not answer it:
  choose "needs_human" with reason "asked_if_human" so the owner takes over the conversation.
Business rules:
- Never quote or estimate prices, promise availability, offer discounts, confirm bookings or take
  payments. Say the team will put together a tailor-made proposal.
- To plan a tour we need: travel dates or month, number of adults and children (and ages), interests,
  places they want to see, and hotel level. Ask for what is still missing, at most two things at a time.
  Never ask for something the customer already told you: if they said "2 adults" there are no children,
  so don't ask about children; if they gave dates or a month, don't ask when they travel.
- Use only facts from the conversation. Do not invent details.
Choose kind:
- "collect_info" when you are mainly asking for missing travel details;
- "routine_reply" for any other simple, friendly answer;
- "needs_human" when the customer asks if they are talking to a person or a bot (reason "asked_if_human"),
  for complaints, cancellations, refunds, payments, safety, legal or medical issues,
  anything about an existing booking, or anything you are unsure about. Then leave reply empty.
Set reason to a short plain phrase saying why, for example "asked_if_human", "complaint", "payment question"."""


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
    uses_playbook = True
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
        if q.readiness == "ready":
            # Enough detail for a proposal: the planner drafts an itinerary, pricing adds a guide for staff.
            for agent, task_type in (("planner", "generate_itinerary"), ("pricing", "price_guide")):
                ctx.queue.enqueue(agent, task_type, {}, request_id=task.request_id, parent=task,
                                  dedupe_key=f"{task_type}:{task.request_id}", priority=90, created_by=self.key)
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

        reply = tidy_message(r.reply)
        if r.kind == "needs_human" or not reply:
            # The heading comes from what the customer wrote, not from the model's label.
            if asked_if_human(history[-1]["body"]):
                title = f"{who} asked if they're talking to a real person. Please take over on WhatsApp"
                body = f'They wrote: "{history[-1]["body"][:300]}"'
            else:
                title = f"WhatsApp from {who} needs a person"
                said = f'They wrote: "{history[-1]["body"][:300]}"'
                # A complaint the model labelled "asked_if_human" would otherwise reach the owner as that label.
                body = said if "asked_if_human" in r.reason else f"{r.reason}. {said}"
            ctx.actions.notify_owner("attention", title, body, request_id=conv.get("request_id"))
            return Outcome("succeeded", {"kind": "needs_human", "reason": r.reason})

        replaced = ctx.actions.cancel_open_messages(conversation_id, self.key)
        action = ctx.actions.propose(
            agent_key=self.key, action_type=f"message.{r.kind}", task_id=task.id,
            request_id=conv.get("request_id"), conversation_id=conversation_id,
            summary=f"WhatsApp reply to {who}", reasoning=r.reason,
            payload={"text": reply, "to": conv["external_id"], "customer_said": history[-1]["body"]},
        )
        request_review(ctx, action, task, priority=15)
        return Outcome("succeeded", {"kind": r.kind, "action_id": str(action["id"]), "replaced": replaced})
