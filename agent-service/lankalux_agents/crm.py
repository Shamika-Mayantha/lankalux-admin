"""Read-only CRM facts. Agents and the Manager answer from these rows, never from memory
of the model, so every statement can be traced back to a query."""
from __future__ import annotations

from typing import Any

from .db import Database

REQUEST_FIELDS = """id, request_code, client_name, email, whatsapp, status, start_date, end_date, duration,
  number_of_adults, number_of_children, children_ages, origin_country, interests, requested_destinations,
  budget, hotel_preference, vehicle_preference, special_requirements, additional_preferences, lead_source,
  created_at, updated_at, last_sent_at, sold_price, assigned_agent_id, selected_itinerary_id"""


class CRM:
    def __init__(self, db: Database):
        self.db = db

    def request(self, request_id: str) -> dict | None:
        return self.db.one(f'SELECT {REQUEST_FIELDS} FROM public."Client Requests" WHERE id = %s', request_id)

    def recent_communications(self, request_id: str, limit: int = 20) -> list[dict]:
        return self.db.all(
            """SELECT channel, direction, subject, left(body, 1500) AS body, status, created_at
               FROM public.communications WHERE request_id = %s ORDER BY created_at DESC LIMIT %s""",
            request_id, limit,
        )

    def day_stats(self) -> dict[str, Any]:
        """Facts for the daily summary (last 24 hours, Sri Lanka business day)."""
        return self.db.one(
            """SELECT
                 (SELECT count(*) FROM public."Client Requests" WHERE created_at > now() - interval '24 hours') AS new_leads,
                 (SELECT count(*) FROM public."Client Requests" WHERE status = 'follow_up') AS open_follow_ups,
                 (SELECT count(*) FROM public."Client Requests" WHERE status = 'sold' AND updated_at > now() - interval '24 hours') AS sold_today,
                 (SELECT count(*) FROM public.communications WHERE direction = 'inbound' AND created_at > now() - interval '24 hours') AS inbound_messages,
                 (SELECT count(*) FROM public.ai_actions WHERE status = 'proposed' AND level = 3) AS awaiting_owner,
                 (SELECT count(*) FROM public.ai_tasks WHERE status = 'failed' AND finished_at > now() - interval '24 hours') AS failed_tasks,
                 (SELECT count(*) FROM public.trips WHERE start_date BETWEEN current_date AND current_date + 2) AS trips_starting_soon"""
        ) or {}

    def stale_follow_ups(self, days: int = 3, limit: int = 50) -> list[dict]:
        """Open leads whose last outbound message is older than `days` (mirrors follow-up.service.ts)."""
        return self.db.all(
            """SELECT r.id, r.client_name, r.status, max(c.created_at) AS last_outbound
               FROM public."Client Requests" r
               LEFT JOIN public.communications c ON c.request_id = r.id AND c.direction = 'outbound'
               WHERE r.status = 'follow_up' AND r.created_at > now() - interval '30 days'
               GROUP BY r.id, r.client_name, r.status
               HAVING coalesce(max(c.created_at), r.created_at) < now() - make_interval(days => %s)
               ORDER BY 4 NULLS FIRST LIMIT %s""",
            days, limit,
        )

    def conversation(self, conversation_id: str) -> dict | None:
        return self.db.one(
            """SELECT id, channel, external_id, request_id, customer_name, mode, service_window_expires_at
               FROM public.ai_conversations WHERE id = %s""",
            conversation_id,
        )

    def conversation_messages(self, conversation_id: str, limit: int = 12) -> list[dict]:
        """The latest messages, oldest first, as the model should read them."""
        rows = self.db.all(
            """SELECT direction, sender_kind, left(body, 1500) AS body, created_at
               FROM public.ai_messages WHERE conversation_id = %s AND status <> 'failed'
               ORDER BY created_at DESC LIMIT %s""",
            conversation_id, limit,
        )
        return list(reversed(rows))
