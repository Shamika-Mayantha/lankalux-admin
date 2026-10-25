"""ai_leads access for the Lead Scout. The agent role may add new leads and fill in its reading of a lead
the owner has not dealt with yet; status changes come from the console."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from .db import Database, jsonb
from .sources import Post


class LeadStore:
    def __init__(self, db: Database):
        self.db = db

    def known(self, urls: list[str]) -> set[str]:
        if not urls:
            return set()
        return {r["url"] for r in self.db.all("SELECT url FROM public.ai_leads WHERE url = ANY(%s)", urls)}

    def add(self, post: Post) -> str | None:
        """Returns the new lead's id, or None when the url is already known."""
        row = self.db.one(
            """INSERT INTO public.ai_leads (source, source_detail, url, title, author, posted_at, excerpt)
               VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (url) DO NOTHING RETURNING id""",
            post.source, post.source_detail, post.url, post.title, post.author, post.posted_at, post.text[:4000],
        )
        return str(row["id"]) if row else None

    def get(self, lead_id: str) -> dict | None:
        return self.db.one("SELECT * FROM public.ai_leads WHERE id = %s", lead_id)

    def unread(self, days: int = 3, limit: int = 20) -> list[str]:
        """New leads the model has not read yet (a judging task that failed, or was cut off)."""
        rows = self.db.all(
            """SELECT id FROM public.ai_leads WHERE score IS NULL AND status = 'new'
               AND found_at > now() - make_interval(days => %s) ORDER BY found_at LIMIT %s""",
            days, limit,
        )
        return [str(r["id"]) for r in rows]

    def save_reading(self, lead_id: str, *, score: int, summary: str, details: dict[str, Any], draft_reply: str,
                     reason: str, quality_notes: list[dict[str, str]]) -> bool:
        row = self.db.one(
            """UPDATE public.ai_leads SET score = %s, summary = %s, details = %s, draft_reply = %s, reason = %s,
                      quality_notes = %s, judged_at = now()
               WHERE id = %s AND status = 'new' RETURNING id""",
            score, summary, jsonb(details), draft_reply, reason, jsonb(quality_notes), lead_id,
        )
        return row is not None

    def last_scan(self) -> datetime | None:
        """When the last search that actually ran finished (a skipped one does not count)."""
        row = self.db.one(
            """SELECT max(finished_at) AS at FROM public.ai_tasks
               WHERE agent_key = 'scout' AND task_type = 'scan_for_leads' AND status = 'succeeded'
                 AND coalesce(result->>'skipped', 'false') <> 'true'""",
        )
        return row["at"] if row else None
