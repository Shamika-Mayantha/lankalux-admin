"""Quality Agent. Checks every Level 2 proposal against the hard business rules before the
AI Manager sees it. The checks are plain code, not the model, so they are fast, predictable
and cannot be talked out of a rule. A hard finding skips the Manager and goes straight to
the owner; soft findings are passed to the Manager's review."""
from __future__ import annotations

import re

from ..queue import Task
from .base import Agent, Context, Outcome, not_enabled

# Money: currency codes or symbols next to a number, or "price/cost ... <number>".
MONEY = re.compile(
    r"(?:[$€£₹]\s?\d|\b(?:usd|gbp|eur|lkr|rs\.?|aud|inr)\s?\d|\d[\d,.]*\s?(?:usd|gbp|eur|lkr|rs|aud|inr|dollars?|pounds?|euros?|rupees?)\b"
    r"|\b(?:price|cost|rate|fee|total)s?\b[^.?!\n]{0,30}\d)",
    re.I,
)
PROMISES = re.compile(
    r"\b(?:discount|% off|special offer|free upgrade|guarantee[ds]?|confirmed booking|booking is confirmed|"
    r"i(?:'ve| have) booked|you are booked|refund|deposit|bank transfer|pay(?:ment)? link|invoice)\b",
    re.I,
)
SELF_DISCLOSURE = re.compile(r"\b(?:as an ai|i am an ai|i'm an ai|language model|chatbot|i am a bot|i'm a bot|virtual assistant)\b", re.I)
HUMAN_CLAIM = re.compile(r"\b(?:i am|i'm) (?:a )?(?:real )?(?:human|person)\b|\bnot a (?:bot|robot|ai)\b", re.I)


def check_text(text: str, *, max_len: int = 1000) -> tuple[list[str], list[str]]:
    """Returns (hard findings, soft findings) for a customer-facing text."""
    hard: list[str] = []
    soft: list[str] = []
    t = text.strip()
    if not t:
        hard.append("The message is empty.")
    if MONEY.search(t):
        hard.append("Mentions a price or an amount. Only the owner may quote prices.")
    if PROMISES.search(t):
        hard.append("Promises a discount, booking, payment or refund. Only the owner may do that.")
    if HUMAN_CLAIM.search(t):
        hard.append("Claims to be a human. The AI must never do that.")
    if SELF_DISCLOSURE.search(t):
        soft.append("Talks about being an AI or assistant, which the owner asked us not to bring up.")
    if len(t) > max_len:
        soft.append(f"Long for a message ({len(t)} characters).")
    if re.search(r"https?://", t):
        soft.append("Contains a link; check it is a LankaLux link.")
    if t.count("?") > 2:
        soft.append("Asks more than two questions at once.")
    return hard, soft


class QualityAgent(Agent):
    key = "quality"
    handlers = {"review_action": "review_action", "review_itinerary": "pending"}

    def pending(self, task: Task, ctx: Context) -> Outcome:
        return not_enabled(self.key, task)

    def review_action(self, task: Task, ctx: Context) -> Outcome:
        action = ctx.crm.action(task.payload["action_id"])
        if not action or action["status"] != "proposed":
            return Outcome("succeeded", {"skipped": True, "reason": "no longer waiting"})
        payload = action.get("payload") or {}
        text = str(payload.get("text") or payload.get("body") or "")
        hard, soft = check_text(text, max_len=1000 if action["action_type"] != "message.follow_up" else 2500) if text else ([], [])

        if hard:
            ctx.actions.notify_owner(
                "approval_needed", f"Please check: {action['summary']}",
                "The Quality check stopped this draft before the AI Manager: " + " ".join(hard),
                request_id=action.get("request_id"), action_id=str(action["id"]),
            )
            return Outcome("succeeded", {"escalated": True, "hard": hard, "soft": soft})

        ctx.queue.enqueue(
            "manager", "review_action", {"action": _brief(action), "quality": {"ok": not soft, "notes": soft}},
            request_id=action.get("request_id"), parent=task, dedupe_key=f"manager_review:{action['id']}",
            priority=20, created_by=self.key, conversation_id=str(action["conversation_id"]) if action.get("conversation_id") else None,
        )
        return Outcome("succeeded", {"passed": True, "soft": soft})


def _brief(action: dict) -> dict:
    return {
        "id": str(action["id"]),
        "agent_key": action["agent_key"],
        "action_type": action["action_type"],
        "level": action["level"],
        "request_id": action.get("request_id"),
        "conversation_id": str(action["conversation_id"]) if action.get("conversation_id") else None,
        "summary": action["summary"],
        "reasoning": action.get("reasoning"),
        "payload": action.get("payload") or {},
    }
