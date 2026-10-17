"""Follow-up Agent. Once an hour (8am-8pm Sri Lanka) it looks for leads in Follow up that have
gone quiet, and drafts a short, personal follow-up email for each. A draft is a Level 2
message.follow_up: the Quality Agent and the AI Manager review it, and the console's
dispatcher sends it from hello@lankalux.com only once the database gate allows it.

Limits (plain code): at most 3 drafts per run, a first follow-up after 5 quiet days, the next no sooner than 10 days later,
at most 2 automated follow-ups per lead in total, and only leads with an email address."""
from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ..queue import Task
from .base import Agent, Context, Outcome, request_review
from .quality import tidy_email_body

QUIET_DAYS = 5
MIN_GAP_DAYS = 10
MAX_FOLLOW_UPS = 2
PER_RUN = 3

FOLLOW_UP_PROMPT = """You write follow-up emails for LankaLux, a premium private-chauffeur and tailor-made travel
company in Sri Lanka, as a warm member of the sales team. The client enquired, we replied, and they have gone
quiet. Write a short, personal nudge (60-120 words) that:
- starts straight with the message: the email template already adds "Dear <first name>," above it and the
  LankaLux sign-off below it, so write no greeting and no signature;
- refers to their actual trip (dates, places, interests) from the facts;
- adds one genuinely useful, specific touch (a seasonal tip, a place that suits their interests) without
  inventing facts about their booking;
- offers to adjust the plan and ends with one easy question (only offer: never say anything has
  already been added, changed or booked);
- sounds like a person: no "I hope this email finds you well", no pressure, no exclamation-mark spam,
  no long dashes (— or –); use commas or full stops instead.
Never mention prices, discounts, availability, deadlines or payments. Never mention AI or automation.
If this is the second follow-up, keep it lighter and make clear we will not keep chasing.
Return the body (plain paragraphs separated by a blank line) and a short, friendly subject."""


class FollowUpEmail(BaseModel):
    subject: str = Field(max_length=120)
    body: str = Field(max_length=2500)


class FollowUpAgent(Agent):
    key = "followup"
    uses_playbook = True
    handlers = {"scan_follow_ups": "scan_follow_ups"}

    def scan_follow_ups(self, task: Task, ctx: Context) -> Outcome:
        drafted: list[str] = []
        skipped: dict[str, str] = {}
        for lead in ctx.crm.stale_follow_ups(days=QUIET_DAYS, limit=20):
            if len(drafted) >= PER_RUN:
                break
            rid = lead["id"]
            reason = self._why_not(ctx, rid)
            if reason:
                skipped[rid] = reason
                continue
            req = ctx.crm.request(rid) or {}
            sent = ctx.crm.follow_ups_sent(rid)
            facts = {
                "lead": req,
                "follow_up_number": sent + 1,
                "recent_emails": ctx.crm.recent_communications(rid, 6),
            }
            mail = ctx.llm.structured(self.system_prompt(ctx, FOLLOW_UP_PROMPT), json.dumps(facts, default=str),
                                      FollowUpEmail, temperature=0.5)
            who = req.get("client_name") or rid
            action = ctx.actions.propose(
                agent_key=self.key, action_type="message.follow_up", task_id=task.id, request_id=rid,
                summary=f"Follow-up email to {who}", reasoning=f"No reply for {QUIET_DAYS}+ days (follow-up {sent + 1} of {MAX_FOLLOW_UPS}).",
                payload={"channel": "email", "to": req.get("email"), "subject": mail.subject.strip(), "body": tidy_email_body(mail.body)},
            )
            request_review(ctx, action, Task(id=task.id, agent_key=self.key, task_type=task.task_type, payload={},
                                             request_id=rid, depth=task.depth), priority=60)
            drafted.append(rid)
        return Outcome("succeeded", {"drafted": drafted, "skipped": skipped})

    @staticmethod
    def _why_not(ctx: Context, rid: str) -> str | None:
        req = ctx.crm.request(rid)
        if not req or not (req.get("email") or "").strip():
            return "no email address"
        if ctx.crm.recent_actions(rid, "message.follow_up", MIN_GAP_DAYS):
            return "followed up recently"
        if ctx.crm.follow_ups_sent(rid) >= MAX_FOLLOW_UPS:
            return "already followed up twice"
        return None
