"""Sales Agent. Qualifies new leads internally (a Level 1 note for staff) and drafts
WhatsApp replies. A draft is only a proposed Level 2 action: the Quality Agent checks it,
the AI Manager approves it (or pings the owner), and the database gate still requires the
customer-messaging switch, and the owner's approval while the owner approves messages."""
from __future__ import annotations

import difflib
import json
import logging
import re
from datetime import datetime, timezone

import psycopg

from pydantic import BaseModel, Field

from ..queue import Task
from .base import AI_DISCLOSURE, Agent, Context, Outcome, request_review
from .quality import asked_if_human, stock_phrases, tidy_message

log = logging.getLogger(__name__)

QUALIFY_PROMPT = """You help the LankaLux sales team. From the enquiry facts, list which travel details
are still missing for a tailor-made itinerary (dates, party size, children's ages, interests,
destinations, hotel level, budget, arrival/departure flights) and rate how ready the lead is.
Do not invent details the customer did not give. Write for staff, in plain English."""


REPLY_PROMPT = AI_DISCLOSURE + """

You are texting a customer on WhatsApp for LankaLux, a Sri Lankan private tour company. Write the next
message the way an experienced Sri Lankan travel consultant texts: plain, friendly and to the point.
How to write:
- One or two short sentences. Three only when you are answering a real question.
- At most one question, and only when something is still missing.
- Plain everyday words, like a person texting. Don't open with praise ("Perfect", "Great choice",
  "Sounds wonderful") and don't use sales phrases like "craft", "tailor the trip just for you",
  "special touches", "unforgettable", "dream trip", "make sure everything feels just right" or "I'm excited".
  No emojis, no long dashes (— or –), no lists. Reply in the customer's language.
- Use the customer's first name now and then, not in every message.
- If the customer asked something, answer it first, honestly and specifically, using the playbook.
- Never send a message LankaLux already sent. Every message moves the chat forward.
- Do not introduce yourself and do not mention AI, bots, assistants or automation.
- Only if the customer literally asks whether they are talking to a real person, a bot or an AI, do not
  answer it: choose "needs_human" with reason "asked_if_human" so the owner takes over the conversation.
  A greeting or a question about a trip is never that.
What we already know:
- trip_sheet holds what the customer told us earlier; the conversation has the rest. Never ask for anything
  that is already known, and never ask again about something they turned down ("no need hotels" means no
  more hotel questions). "2 adults" with no children mentioned means children is 0.
- To plan a trip the team needs: travel dates or month (and roughly how long), adults and children (with
  ages), and interests or places. Hotel level and vehicle are optional: ask about them once at most.
- Once dates, party size and interests are known, or the customer asks for an itinerary and dates and
  party size are known, stop asking: say the team will put together an itinerary and send it over.
Business rules:
- Never quote or estimate prices, promise availability, offer discounts, confirm bookings or take
  payments. Say the team will put together a tailor-made proposal.
- Use only facts from the conversation. Do not invent details.
Also fill sheet with everything the customer has told us so far (trip_sheet plus the conversation):
startDate and endDate (YYYY-MM-DD, only if exact), dateNotes (rough timing, like "March, about 10 days"),
adults, children, childrenAges, interests, places, hotel, vehicle, declined (things they said no to, like
"hotels"), wantsItinerary (true if they asked for an itinerary, plan or proposal). Leave unknown fields empty.
Choose kind:
- "collect_info" when you are mainly asking for missing travel details;
- "routine_reply" for any other simple, friendly answer;
- "needs_human" only when the customer asks if they are talking to a person or a bot (reason "asked_if_human"),
  for complaints, cancellations, refunds, prices or payments, safety, legal or medical issues, or changes to a
  trip that is already booked and paid. Then leave reply empty.
Most messages are new enquiries: "hello", "I'd like details about my trip to Sri Lanka" or "can you help me plan
a holiday" mean someone is starting to plan. Greet them and ask for what's missing; that is "collect_info".
Set reason to a short plain phrase saying why, for example "asked_if_human", "complaint", "payment question"."""


RECHECK = """

Note: the customer's last message does NOT ask whether they are talking to a person or a bot, so
"asked_if_human" is wrong here. Reply to what they actually wrote. Use "needs_human" only if it really
is a complaint, cancellation, refund, price, payment, safety, legal or medical matter."""

FIX = """

Your last draft was not good enough to send:
{problems}
Write it again. Keep it short and plain."""

HANDED_OVER = ("Thanks{name}. That's everything we need for now, so our team will put together an itinerary "
               "for you and send it over soon.")


class TripSheet(BaseModel):
    """What the customer has told us. Same keys as the Website Concierge's lead, plus a few WhatsApp ones."""
    startDate: str | None = Field(default=None, max_length=40)
    endDate: str | None = Field(default=None, max_length=40)
    dateNotes: str | None = Field(default=None, max_length=200)
    adults: int | None = Field(default=None, ge=0, le=100)
    children: int | None = Field(default=None, ge=0, le=50)
    childrenAges: list[int] = Field(default_factory=list, max_length=20)
    interests: str | None = Field(default=None, max_length=300)
    places: str | None = Field(default=None, max_length=300)
    hotel: str | None = Field(default=None, max_length=200)
    vehicle: str | None = Field(default=None, max_length=200)
    declined: list[str] = Field(default_factory=list, max_length=10)
    wantsItinerary: bool = False


class Reply(BaseModel):
    kind: str = Field(pattern="^(routine_reply|collect_info|needs_human)$")
    reply: str = Field(default="", max_length=1000)
    reason: str = Field(max_length=300)
    sheet: TripSheet = Field(default_factory=TripSheet)


SHEET_KEYS = tuple(TripSheet.model_fields)
# A question about each detail, and whether the trip sheet already has it (or the customer turned it down).
ASKS = {
    "travel dates": (re.compile(r"\b(?:when|dates?|which month|what month|how long|how many (?:days|nights))\b", re.I),
                     lambda s: s.get("startDate") or s.get("dateNotes"), ("date",)),
    "how many people": (re.compile(r"\bhow many (?:of you|people|adults|guests|travell?ers)\b|\badults?\b|"
                                   r"\btravell?ing with\b|\bgroup size\b|\bparty\b", re.I),
                        lambda s: s.get("adults"), ("people", "adult")),
    "children": (re.compile(r"\b(?:child(?:ren)?|kids?|little ones)\b", re.I),
                 lambda s: s.get("children") is not None, ("child", "kid")),
    "interests": (re.compile(r"\binterest\w*|\bactivities\b|\bwhat (?:would you|do you) (?:like|enjoy|love)|"
                             r"\bkind of (?:trip|holiday|experiences?)\b|\bexperiences\b", re.I),
                  lambda s: s.get("interests") or s.get("places"), ("interest",)),
    "hotels": (re.compile(r"\b(?:hotels?|accommodation|resorts?|villas?|guest ?houses?)\b", re.I),
               lambda s: s.get("hotel"), ("hotel", "accommodation")),
    "the vehicle": (re.compile(r"\b(?:vehicle|car|van|transport|transfers?)\b", re.I),
                    lambda s: s.get("vehicle"), ("vehicle", "car", "van", "transport")),
}
PRAISE_OPENER = re.compile(r"^\s*(?:perfect|great|wonderful|lovely|amazing|fantastic|awesome|excellent|brilliant)\b[!.,]*\s*", re.I)


def merge_sheet(stored: dict, new: TripSheet) -> dict:
    """New details from the model fill in or update the sheet; nothing it leaves empty is lost."""
    lead = dict(stored or {})
    for key, value in new.model_dump().items():
        if key == "declined":
            lead[key] = sorted({*lead.get(key, []), *(v.strip().lower() for v in value if v.strip())})
        elif key == "wantsItinerary":
            lead[key] = bool(lead.get(key)) or value
        elif value not in (None, "", []):
            lead[key] = value
    return lead


def _known(sheet: dict, check, declined_words) -> bool:
    return bool(check(sheet)) or any(w in d for d in sheet.get("declined", []) for w in declined_words)


def questions(text: str) -> list[str]:
    return [q.strip() for q in re.findall(r"[^.!?\n]*\?", text) if q.strip()]


def reasked(text: str, sheet: dict) -> list[str]:
    """Details the draft asks about although the customer already gave them (or said no to them)."""
    found = []
    for q in questions(text):
        for label, (pattern, check, words) in ASKS.items():
            if pattern.search(q) and _known(sheet, check, words) and label not in found:
                found.append(label)
    return found


def ready_for_itinerary(sheet: dict) -> bool:
    dates, party = sheet.get("startDate") or sheet.get("dateNotes"), sheet.get("adults")
    return bool(dates and party and (sheet.get("interests") or sheet.get("places") or sheet.get("wantsItinerary")))


def repeats(text: str, sent: list[str]) -> bool:
    t = re.sub(r"\W+", " ", text.lower()).strip()
    return any(difflib.SequenceMatcher(None, t, re.sub(r"\W+", " ", s.lower()).strip()).ratio() >= 0.8 for s in sent if s)


def first_name(name: str | None) -> str | None:
    """The WhatsApp profile name, unless it is our own (the owner's test phone shows "LankaLux")."""
    n = (name or "").strip()
    if not n or "lankalux" in n.lower().replace(" ", "") or not re.match(r"^[^\W\d_]", n):
        return None
    first = n.split()[0]
    return first.capitalize() if first.islower() else first


def problems_with(text: str, sheet: dict, sent: list[str], handing_over: bool) -> list[str]:
    found = []
    if repeats(text, sent):
        found.append("- It repeats a message LankaLux already sent. Say something new that moves the chat on.")
    if again := reasked(text, sheet):
        found.append(f"- It asks about {', '.join(again)}, which the customer already answered or turned down. Don't ask that.")
    if handing_over and questions(text):
        found.append("- We now have enough to plan. Ask nothing; say the team will put together an itinerary and send it over.")
    elif len(questions(text)) > 1:
        found.append("- It asks more than one question. Ask one at most.")
    if stock := stock_phrases(text):
        found.append(f"- It uses sales phrases ({', '.join(stock)}). Use plain words instead.")
    return found


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
        stored = conv.get("lead") or {}
        sheet = {k: v for k, v in stored.items() if k in SHEET_KEYS}
        name = first_name(conv.get("customer_name"))
        facts = {
            "customer_name": name,
            "trip_sheet": sheet,
            "conversation": [{"from": "customer" if m["direction"] == "inbound" else "lankalux", "text": m["body"]}
                             for m in history],
            "lead": ctx.crm.request(conv["request_id"]) if conv.get("request_id") else None,
        }
        user = json.dumps(facts, default=str)
        system = self.system_prompt(ctx, REPLY_PROMPT)
        r = ctx.llm.structured(system, user, Reply)
        if r.kind == "needs_human" and "asked_if_human" in r.reason and not asked_if_human(history[-1]["body"]):
            # The small model sometimes hands ordinary enquiries over as "asked if human". The customer
            # didn't ask that, so it gets one more go with the mistake pointed out.
            r = ctx.llm.structured(system + RECHECK, user, Reply)
        who = conv.get("customer_name") or f"+{conv['external_id']}"

        sent = [m["body"] for m in history if m["direction"] == "outbound"][-4:]
        lead = merge_sheet(stored, r.sheet)
        handed_over = stored.get("handedOverAt") or any("itinerary" in m.lower() and "send it over" in m.lower() for m in sent)
        handing_over = ready_for_itinerary(lead) and not handed_over
        reply = _plain(r.reply)
        if r.kind != "needs_human" and reply and (problems := problems_with(reply, lead, sent, handing_over)):
            # Checked in code, not left to the model: repeats, questions it already has answers to,
            # more questions once we know enough, and stock sales phrases. One more go with the reasons.
            r = ctx.llm.structured(system + FIX.format(problems="\n".join(problems)), user, Reply)
            lead = merge_sheet(lead, r.sheet)
            reply = _plain(r.reply)
        if r.kind != "needs_human" and reply:
            if handing_over:
                if questions(reply) or repeats(reply, sent):
                    reply = HANDED_OVER.format(name=f", {name}" if name else "")
            else:
                reply = _drop_reasked(reply, lead)
            if repeats(reply, sent):
                r = r.model_copy(update={"kind": "needs_human", "reason": "the AI kept repeating the same message"})
            elif not reply:
                r = r.model_copy(update={"kind": "needs_human", "reason": "the AI only re-asked for details it already has"})

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
            self._save_sheet(ctx, conversation_id, stored, lead)
            return Outcome("succeeded", {"kind": "needs_human", "reason": r.reason})

        if handing_over:
            title = f"{who} is ready for an itinerary"
            if not ctx.crm.notified_recently(title, hours=72):
                ctx.actions.notify_owner("attention", title, "Trip details so far: " + describe_sheet(lead) +
                                         ". The customer was told the team will send an itinerary.",
                                         request_id=conv.get("request_id"))
            lead["handedOverAt"] = datetime.now(timezone.utc).isoformat()
        self._save_sheet(ctx, conversation_id, stored, lead)

        replaced = ctx.actions.cancel_open_messages(conversation_id, self.key)
        action = ctx.actions.propose(
            agent_key=self.key, action_type=f"message.{r.kind}", task_id=task.id,
            request_id=conv.get("request_id"), conversation_id=conversation_id,
            summary=f"WhatsApp reply to {who}", reasoning=r.reason,
            payload={"text": reply, "to": conv["external_id"], "customer_said": history[-1]["body"]},
        )
        request_review(ctx, action, task, priority=15)
        return Outcome("succeeded", {"kind": r.kind, "action_id": str(action["id"]), "replaced": replaced})

    @staticmethod
    def _save_sheet(ctx: Context, conversation_id: str, stored: dict, lead: dict) -> None:
        if lead == stored:
            return
        try:
            ctx.crm.save_lead(conversation_id, lead)
        except psycopg.Error as err:
            # Without the trip-sheet grant the reply still goes out; the model re-reads the chat instead.
            log.warning("could not save the trip sheet: %s", err)


def _plain(text: str) -> str:
    return tidy_message(PRAISE_OPENER.sub("", text or "", count=1)).strip()


def _drop_reasked(text: str, sheet: dict) -> str:
    """Last resort after the retry: cut any question about details we already have."""
    for q in questions(text):
        if reasked(q, sheet):
            text = text.replace(q, "")
    text = tidy_message(text).strip(" ,")
    return text if len(text.split()) >= 4 else ""


def describe_sheet(lead: dict) -> str:
    parts = []
    if lead.get("startDate"):
        parts.append(f"dates {lead['startDate']}" + (f" to {lead['endDate']}" if lead.get("endDate") else ""))
    if lead.get("dateNotes"):
        parts.append(f"timing {lead['dateNotes']}")
    if lead.get("adults") is not None:
        parts.append(f"{lead['adults']} adults")
    if lead.get("children"):
        ages = f" (ages {', '.join(map(str, lead['childrenAges']))})" if lead.get("childrenAges") else ""
        parts.append(f"{lead['children']} children{ages}")
    for key in ("interests", "places", "hotel", "vehicle"):
        if lead.get(key):
            parts.append(f"{key} {lead[key]}")
    if lead.get("declined"):
        parts.append(f"doesn't want {', '.join(lead['declined'])}")
    return "; ".join(parts) or "none recorded"
