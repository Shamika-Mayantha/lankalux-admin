"""Win-back Agent. Once a week (Monday from 10am Sri Lanka time) it looks for people who enquired
30 to 365 days ago, never booked, and have not heard from us (or written to us) in the last 30 days,
and drafts a short, friendly email for each. A draft is a Level 3 message.win_back: it goes out only
when the owner approves it on the AI page, and the dispatcher adds the unsubscribe link.

Limits (plain code, and the database refuses unsubscribed addresses whatever this code does): at most
10 drafts a week, at most one per person (email address) every 6 months, never to anyone who
unsubscribed or who booked with us, and only open, follow-up or expired enquiries with an email."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from ..queue import Task
from .base import Agent, Context, Outcome
from .quality import check_text, tidy_email_body

PER_WEEK = 10
GAP_DAYS = 182  # one win-back per person every 6 months
QUIET_DAYS = 30
MIN_AGE_DAYS = 30
MAX_AGE_DAYS = 365
DRAFT_PRIORITY = 150
STATUSES = ("new", "follow_up", "expired")  # never sold, after-sales or cancelled requests

WIN_BACK_PROMPT = """You write short emails for LankaLux, a private chauffeur and tailor-made travel company in
Sri Lanka. This person asked us about a Sri Lanka trip some months ago and did not book. Write a friendly,
low-pressure note (50-100 words) that:
- starts straight with the message: the email template already adds "Dear <first name>," above it and the
  LankaLux sign-off below it, so write no greeting and no signature;
- mentions what they asked about (when, who, places or interests) from the facts, in a natural way, and
  if the facts are thin, keeps it general instead of guessing;
- gives one genuinely useful, specific tip about a place or experience in Sri Lanka that suits them (a
  well-known fact only); say nothing about weather, monsoons or seasons unless the playbook below states it;
  if the facts do not say what they like or where they wanted to go, leave the tip out;
- says that if they are still thinking about Sri Lanka, or planning a trip for next year, we are happy to put
  a fresh plan together, and ends with one easy question;
- sounds like a person writing plainly: no "I hope this email finds you well", no "just checking in",
  no pressure, no exclamation-mark spam, no long dashes (— or –), no emojis.
Never mention prices, discounts, offers, availability, deadlines or payments. Never say anything is reserved,
booked or changed. Never mention AI or automation, and never claim to be a person by name.
Do not write an unsubscribe line: the email template adds it.
Return the body (plain paragraphs separated by a blank line) and a short, friendly subject (no "Re:")."""


class WinBackEmail(BaseModel):
    subject: str = Field(max_length=120)
    body: str = Field(max_length=2000)


class WinBack:
    """The win-back rules as queries. The database (ai_begin_action) also refuses unsubscribed addresses."""

    def __init__(self, db):
        self.db = db

    def drafted_this_week(self) -> int:
        row = self.db.one(
            """SELECT count(*) AS n FROM public.ai_actions
               WHERE action_type = 'message.win_back' AND status <> 'cancelled' AND created_at > now() - interval '7 days'"""
        )
        return int((row or {}).get("n") or 0)

    def candidates(self, limit: int) -> list[dict]:
        """One request per email address (the latest), most recent enquiries first."""
        return self.db.all(
            f"""SELECT id, email, created_at FROM (
                  SELECT DISTINCT ON (lower(btrim(r.email))) r.id, lower(btrim(r.email)) AS email, r.created_at
                  FROM public."Client Requests" r
                  WHERE r.created_at < now() - make_interval(days => %s)
                    AND r.created_at > now() - make_interval(days => %s)
                    AND r.status IN {STATUSES!r}
                    AND btrim(coalesce(r.email, '')) LIKE '%%_@_%%'
                  ORDER BY lower(btrim(r.email)), r.created_at DESC
                ) c
                WHERE {self._eligible_sql('c.email')}
                ORDER BY c.created_at DESC LIMIT %s""",
            MIN_AGE_DAYS, MAX_AGE_DAYS, *self._eligible_args(), limit,
        )

    def why_not(self, request_id: str) -> str | None:
        req = self.db.one(
            'SELECT id, lower(btrim(email)) AS email, status, created_at FROM public."Client Requests" WHERE id = %s', request_id
        )
        if not req or "@" not in (req.get("email") or ""):
            return "no email address"
        if req["status"] not in STATUSES:
            return f"status is {req['status']}"
        age = (datetime.now(timezone.utc) - req["created_at"]).days
        if not MIN_AGE_DAYS <= age <= MAX_AGE_DAYS:
            return "not between 30 and 365 days old"
        ok = self.db.one(f"WITH c AS (SELECT %s::text AS email) SELECT {self._eligible_sql('c.email')} AS ok FROM c",
                         req["email"], *self._eligible_args())
        return None if ok and ok["ok"] else "unsubscribed, booked, in touch recently, or emailed in the last 6 months"

    @staticmethod
    def _eligible_sql(email: str) -> str:
        """True when nobody with this address booked, unsubscribed, wrote or heard from us in 30 days,
        or got a win-back in the last 6 months. `email` is a column; the %s are filled by _eligible_args."""
        same = f"""SELECT r2.id FROM public."Client Requests" r2 WHERE lower(btrim(r2.email)) = {email}"""
        return f"""(NOT EXISTS (SELECT 1 FROM public.ai_email_optouts o WHERE o.email = {email})
                 AND NOT EXISTS ({same} AND r2.status IN ('sold', 'after_sales'))
                 AND NOT EXISTS (SELECT 1 FROM public.communications m
                                 WHERE m.request_id IN ({same}) AND m.created_at > now() - make_interval(days => %s))
                 AND NOT EXISTS (SELECT 1 FROM public.ai_actions a
                                 WHERE a.action_type LIKE 'message.%%' AND a.status IN ('proposed', 'approved', 'executing')
                                   AND a.request_id IN ({same}))
                 AND NOT EXISTS (SELECT 1 FROM public.ai_actions a
                                 WHERE a.action_type = 'message.win_back' AND a.status <> 'cancelled'
                                   AND lower(btrim(a.payload->>'to')) = {email}
                                   AND a.created_at > now() - make_interval(days => %s)))"""

    @staticmethod
    def _eligible_args() -> tuple:
        return (QUIET_DAYS, GAP_DAYS)


class WinBackAgent(Agent):
    key = "winback"
    uses_playbook = True
    handlers = {"scan_win_backs": "scan_win_backs", "draft_win_back": "draft_win_back"}

    def scan_win_backs(self, task: Task, ctx: Context) -> Outcome:
        """Queues one draft per eligible person, up to what is left of this week's 10."""
        rules = WinBack(ctx.actions.db)
        room = PER_WEEK - rules.drafted_this_week()
        if room <= 0:
            return Outcome("succeeded", {"queued": [], "reason": "this week's limit is reached"})
        queued = []
        for c in rules.candidates(room):
            # Each draft is its own task, so a slow model never holds up customer replies.
            if ctx.queue.enqueue(self.key, "draft_win_back", {}, request_id=c["id"], parent=task,
                                 dedupe_key=f"win_back:{c['email']}", priority=DRAFT_PRIORITY, created_by=self.key):
                queued.append(c["id"])
        return Outcome("succeeded", {"queued": queued, "room": room})

    def draft_win_back(self, task: Task, ctx: Context) -> Outcome:
        rid = task.request_id
        rules = WinBack(ctx.actions.db)
        if reason := rules.why_not(rid):
            return Outcome("succeeded", {"skipped": reason})
        if rules.drafted_this_week() >= PER_WEEK:
            return Outcome("succeeded", {"skipped": "this week's limit is reached"})
        req = ctx.crm.request(rid) or {}
        facts = {
            "enquiry": {k: req.get(k) for k in (
                "client_name", "created_at", "start_date", "end_date", "duration", "number_of_adults", "number_of_children",
                "origin_country", "interests", "requested_destinations", "special_requirements", "additional_preferences")},
            "today": datetime.now(timezone.utc).date().isoformat(),
            "earlier_emails": ctx.crm.recent_communications(rid, 4),
        }
        mail = ctx.llm.structured(self.system_prompt(ctx, WIN_BACK_PROMPT), json.dumps(facts, default=str),
                                  WinBackEmail, temperature=0.5)
        body = tidy_email_body(mail.body)
        subject = tidy_email_body(mail.subject).replace("\n", " ").strip()
        hard, soft = check_text(body, max_len=1500)
        who = req.get("client_name") or rid
        months = max(1, (datetime.now(timezone.utc) - req["created_at"]).days // 30) if req.get("created_at") else None
        notes = " ".join(hard + soft)
        action = ctx.actions.propose(
            agent_key=self.key, action_type="message.win_back", task_id=task.id, request_id=rid,
            summary=f"Win-back email to {who}",
            reasoning=(f"Enquired about {months} month{'s' if months != 1 else ''} ago and never booked." if months else "Never booked.")
                      + (f" Check: {notes}" if notes else ""),
            payload={"channel": "email", "to": (req.get("email") or "").strip().lower(), "subject": subject, "body": body},
        )
        ctx.actions.notify_owner(
            "approval_needed", f"{'Please check: ' if hard else ''}Win-back email to {who} is waiting for you",
            notes or "Read it, edit it if you like, and approve or reject it on the AI page.",
            request_id=rid, action_id=str(action["id"]),
        )
        return Outcome("succeeded", {"action_id": str(action["id"]), "hard": hard, "soft": soft})
