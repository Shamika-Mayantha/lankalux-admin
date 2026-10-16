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

    # --- Facts for the autonomous agents -------------------------------------------------

    def settings(self) -> dict:
        return self.db.one(
            "SELECT system_paused, customer_messaging_enabled, owner_approves_messages FROM public.ai_settings WHERE id"
        ) or {}

    def action(self, action_id: str) -> dict | None:
        return self.db.one(
            """SELECT id, agent_key, action_type, level, status, request_id, conversation_id, summary, reasoning, payload, created_at
               FROM public.ai_actions WHERE id = %s""",
            action_id,
        )

    def recent_actions(self, request_id: str, action_prefix: str, days: int) -> list[dict]:
        """This agent family's actions for a request in the last `days`, any status but cancelled."""
        return self.db.all(
            """SELECT id, action_type, status, created_at FROM public.ai_actions
               WHERE request_id = %s AND action_type LIKE %s AND status <> 'cancelled'
                 AND created_at > now() - make_interval(days => %s)""",
            request_id, f"{action_prefix}%", days,
        )

    def follow_ups_sent(self, request_id: str) -> int:
        row = self.db.one(
            """SELECT count(*) AS n FROM public.ai_actions
               WHERE request_id = %s AND action_type = 'message.follow_up' AND status = 'executed'""",
            request_id,
        )
        return int((row or {}).get("n") or 0)

    def notified_recently(self, title: str, hours: int = 20) -> bool:
        return bool(self.db.one(
            "SELECT 1 AS x FROM public.ai_notifications WHERE title = %s AND created_at > now() - make_interval(hours => %s) LIMIT 1",
            title, hours,
        ))

    def itinerary_options(self, request_id: str) -> list[dict]:
        """Itinerary options for a request, plus one 'legacy' row when the old text column holds some."""
        return self.db.all(
            """SELECT option_number, status, title FROM public.itineraries WHERE request_id = %s
               UNION ALL
               SELECT 0, 'legacy', NULL FROM public."Client Requests"
               WHERE id = %s AND coalesce(btrim(itineraryoptions), '') NOT IN ('', '[]', '{}', 'null')
               ORDER BY 1""",
            request_id, request_id,
        )

    def upcoming_sold_trips(self, days: int = 7) -> list[dict]:
        """Sold requests starting within `days`, with what operations still has to arrange."""
        return self.db.all(
            """SELECT id, client_name, start_date, end_date, number_of_adults, number_of_children,
                      assigned_driver_id, assigned_vehicle_id, selected_itinerary_id, arrival_flight
               FROM public."Client Requests"
               WHERE status = 'sold' AND start_date BETWEEN current_date AND current_date + %s
               ORDER BY start_date""",
            days,
        )

    def price_samples(self, limit: int = 50) -> list[dict]:
        """Prices LankaLux actually sold at (free text on the request, e.g. 'Total Price: 660 USD')."""
        return self.db.all(
            """SELECT id, sold_price, duration, number_of_adults, number_of_children, start_date
               FROM public."Client Requests"
               WHERE status IN ('sold', 'after_sales') AND coalesce(sold_price, '') <> ''
               ORDER BY updated_at DESC LIMIT %s""",
            limit,
        )
