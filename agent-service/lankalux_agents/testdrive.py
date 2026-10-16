"""Test drive: runs made-up enquiries through the real model, with the same prompts, playbook and
Quality rules the live agents use, and reports what each agent would have done. Nothing is
proposed, approved or sent, and no customer or CRM row is touched.

  lankalux-testdrive                 # prints the report and saves it for the console
  lankalux-testdrive --no-save       # print only

With AGENT_DATABASE_URL set it reads the owner's playbook and stores the report as one
'testdrive.report' line in ai_activity_log (the only write), so Claude and the owner can read it.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass, field

from .agents.base import Context
from .agents.followup import FOLLOW_UP_PROMPT, FollowUpAgent, FollowUpEmail
from .agents.manager import MANAGER_PROMPT, ManagerAgent, Review
from .agents.quality import asked_if_human, check_text, tidy_email_body, tidy_message
from .agents.sales import QUALIFY_PROMPT, REPLY_PROMPT, Qualification, Reply, SalesAgent
from .db import Database, jsonb
from .llm import LLMError, OllamaLLM


@dataclass
class Chat:
    title: str
    customer: str
    messages: list[tuple[str, str]]  # (customer|lankalux, text)
    expect: str  # what a good outcome looks like, for the reader
    lead: dict | None = None


CHATS = [
    Chat("New enquiry with details", "Emma",
         [("customer", "Hi! We're 2 adults thinking about 10 days in Sri Lanka in late February. We love wildlife and want a few beach days at the end.")],
         "a warm reply that suggests a shape (culture or safari, then the south coast) and asks one or two missing things; Manager approves"),
    Chat("Vague first message", "", [("customer", "hello, do you do tours?")],
         "a friendly yes, explains private chauffeur-guided journeys, asks for dates and party size; Manager approves"),
    Chat("Family with young children", "Priya",
         [("customer", "Hi, we are a family of 4, kids are 4 and 7. Is Yala too much for them? We have 8 days in December."),],
         "gentle advice (Udawalawe can be easier, pace before highlights), no guarantees; Manager approves"),
    Chat("Price question", "Mark",
         [("customer", "Hi, 2 of us for 7 days in March, roughly how much would that cost?")],
         "no price: either the owner is pinged, or the reply says the team will send a tailor-made proposal"),
    Chat("Asks if it's a bot", "Leo",
         [("customer", "Hi, quick one, am I talking to a real person or a bot?")],
         "nothing is drafted; the owner is pinged to take over"),
    Chat("Unhappy guest", "Sarah",
         [("customer", "Our driver was 40 minutes late at the airport yesterday and nobody answered the phone. Not impressed.")],
         "nothing is sent automatically; the owner is pinged"),
    Chat("Follow-up question mid-chat", "Tom",
         [("customer", "Hi, we're thinking about Sri Lanka in January"),
          ("lankalux", "Lovely choice, Tom. January is a great time for the south and west coasts. How many of you are travelling, and how many days do you have?"),
          ("customer", "Just me and my wife, about 12 days. Is the train to Ella worth it?")],
         "answers the train question honestly (beautiful, tickets extra, booked ahead) and moves the plan on; Manager approves"),
]

QUIET_LEAD = {
    "lead": {"client_name": "David Clarke", "email": "david@example.com", "status": "follow_up",
             "start_date": "2027-01-16", "end_date": "2027-01-26", "number_of_adults": 2, "number_of_children": 3,
             "children_ages": "5, 9, 12", "interests": "elephants, beaches, the train"},
    "follow_up_number": 1,
    "recent_emails": [{"direction": "outbound", "subject": "LankaLux Journey — Family Comfort Journey through Sri Lanka",
                       "body": "Dear David, We are delighted to share your personalised LankaLux Journey...", "days_ago": 5}],
}

WEB_LEAD = {
    "request": {"client_name": "Anna Becker", "origin_country": "Germany", "start_date": "2027-02-03", "end_date": "2027-02-14",
                "number_of_adults": 2, "number_of_children": 1, "children_ages": None,
                "interests": "wildlife, tea country, beaches", "additional_preferences": "We would love a train ride and a safari."},
    "messages": [],
}


@dataclass
class Report:
    lines: list[str] = field(default_factory=list)
    summary: dict = field(default_factory=lambda: {"approved": 0, "escalated": 0, "to_owner": 0, "errors": 0})

    def add(self, text: str = "") -> None:
        print(text)
        self.lines.append(text)


def _ctx(playbook: str) -> Context:
    return Context(queue=None, llm=None, actions=None, crm=None, memory=None, playbook=playbook)  # type: ignore[arg-type]


def run(llm: OllamaLLM, playbook: str) -> Report:
    ctx = _ctx(playbook)
    sales, manager, followup = SalesAgent(), ManagerAgent(), FollowUpAgent()
    r = Report()
    r.add(f"# AI test drive ({time.strftime('%d %b %Y %H:%M')})")
    r.add(f"Model {llm.model}. Playbook {'loaded' if playbook.strip() else 'NOT loaded'} ({len(playbook)} characters).")
    r.add("Nothing below was sent to anyone.")

    for chat in CHATS:
        r.add("")
        r.add(f"## {chat.title}")
        for who, text in chat.messages:
            r.add(f"> {'Customer' if who == 'customer' else 'LankaLux'}: {text}")
        r.add(f"Good outcome: {chat.expect}")
        facts = {"customer_name": chat.customer or None,
                 "conversation": [{"from": who, "text": text} for who, text in chat.messages], "lead": chat.lead}
        try:
            t = time.monotonic()
            reply = llm.structured(sales.system_prompt(ctx, REPLY_PROMPT), json.dumps(facts), Reply)
            took = time.monotonic() - t
        except LLMError as err:
            r.add(f"**Sales failed:** {err}")
            r.summary["errors"] += 1
            continue
        text = tidy_message(reply.reply)
        if reply.kind == "needs_human" or not text:
            why = "asked if they're talking to a real person" if asked_if_human(chat.messages[-1][1]) else reply.reason
            r.add(f"**Sales:** hands it to you ({why}). Nothing drafted. ({took:.0f}s)")
            r.summary["to_owner"] += 1
            continue
        r.add(f"**Sales drafts** ({reply.kind}, {took:.0f}s): {text}")
        hard, soft = check_text(text)
        if hard:
            r.add(f"**Quality:** stops it and pings you: {' '.join(hard)}")
            r.summary["to_owner"] += 1
            continue
        if soft:
            r.add(f"**Quality notes:** {' '.join(soft)}")
        draft = {"action_type": f"message.{reply.kind}", "summary": f"WhatsApp reply to {chat.customer or 'a new contact'}",
                 "reasoning": reply.reason, "payload": {"text": text}}
        review_facts = {"draft": draft, "conversation": facts["conversation"], "lead": chat.lead,
                        "quality_findings": {"ok": not soft, "notes": soft}, "past_corrections": []}
        try:
            review = llm.structured(manager.system_prompt(ctx, MANAGER_PROMPT), json.dumps(review_facts), Review)
        except LLMError as err:
            r.add(f"**Manager failed:** {err}")
            r.summary["errors"] += 1
            continue
        verdict = {"approve": "approves and it would be sent", "escalate": "flags it for you", "reject": "would not send it; pings you"}
        r.add(f"**AI Manager:** {verdict[review.decision]}. {review.reason}")
        r.summary["approved" if review.decision == "approve" else "escalated"] += 1

    r.add("")
    r.add("## Follow-up email to a quiet lead")
    r.add("David Clarke, family of 5, 16 to 26 January, itinerary sent 5 days ago with no reply.")
    try:
        mail = llm.structured(followup.system_prompt(ctx, FOLLOW_UP_PROMPT), json.dumps(QUIET_LEAD), FollowUpEmail, temperature=0.5)
        r.add(f"**Subject:** {mail.subject}")
        r.add("Dear David,")
        r.add("")
        body = tidy_email_body(mail.body)
        r.add(body)
        hard, soft = check_text(body, max_len=2500)
        r.add(f"**Quality:** {'stops it: ' + ' '.join(hard) if hard else 'passes' + (' (' + ' '.join(soft) + ')' if soft else '')}")
    except LLMError as err:
        r.add(f"**Follow-up failed:** {err}")
        r.summary["errors"] += 1

    r.add("")
    r.add("## Website lead check (internal note for staff)")
    try:
        q = llm.structured(sales.system_prompt(ctx, QUALIFY_PROMPT), json.dumps(WEB_LEAD), Qualification)
        r.add(f"**Readiness:** {q.readiness}. Missing: {', '.join(q.missing) or 'nothing'}. Note: {q.note}")
    except LLMError as err:
        r.add(f"**Lead check failed:** {err}")
        r.summary["errors"] += 1

    s = r.summary
    r.add("")
    r.add(f"**Totals:** {s['approved']} approved by the Manager, {s['escalated']} flagged by the Manager, "
          f"{s['to_owner']} handed to you before the Manager, {s['errors']} errors.")
    return r


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--no-save", action="store_true", help="print only; do not store the report")
    ap.add_argument("--playbook", help="read the playbook from this file instead of the database")
    args = ap.parse_args()

    url = os.environ.get("AGENT_DATABASE_URL", "")
    db = Database(url, max_size=1) if url else None
    playbook = ""
    if args.playbook:
        playbook = open(args.playbook, encoding="utf-8").read()
    elif db:
        playbook = (db.one("SELECT playbook FROM public.ai_settings WHERE id") or {}).get("playbook") or ""

    llm = OllamaLLM(os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"),
                    os.environ.get("AGENT_MODEL", "qwen3:4b"), os.environ.get("EMBED_MODEL", "nomic-embed-text"))
    report = run(llm, playbook)
    if db and not args.no_save:
        db.one("""INSERT INTO public.ai_activity_log (actor_kind, agent_key, event, detail)
                  VALUES ('agent', 'manager', 'testdrive.report', %s) RETURNING id""",
               jsonb({"report": "\n".join(report.lines)[:60000], **report.summary}))
        print("\nSaved. Claude can read this report now.")


if __name__ == "__main__":
    main()
