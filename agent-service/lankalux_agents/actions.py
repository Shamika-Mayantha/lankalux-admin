"""Proposing and running actions.

Agents never perform side effects directly. They propose an ai_actions row; the level
comes from ai_action_policies inside Postgres, and ai_begin_action() decides whether it
may run. This module only asks.
"""
from __future__ import annotations

import logging
from typing import Any

from psycopg import errors

from .db import Database, jsonb

log = logging.getLogger(__name__)

CRM_ACTIONS = {"crm.create_lead", "crm.update_lead_details", "crm.add_note", "workflow.change_status"}


class ActionBlocked(Exception):
    """The gate refused the action (needs approval, paused, human takeover...)."""


class Actions:
    def __init__(self, db: Database):
        self.db = db

    def propose(self, *, agent_key: str, action_type: str, summary: str, payload: dict[str, Any],
                task_id: str | None = None, request_id: str | None = None, conversation_id: str | None = None,
                reasoning: str | None = None) -> dict:
        # level is overwritten from the policy table by a trigger; 3 is only a placeholder.
        return self.db.one(
            """INSERT INTO public.ai_actions (agent_key, action_type, level, summary, reasoning, payload,
                                              task_id, request_id, conversation_id)
               VALUES (%s, %s, 3, %s, %s, %s, %s, %s, %s) RETURNING id, level, status""",
            agent_key, action_type, summary[:500], reasoning, jsonb(payload), task_id, request_id, conversation_id,
        )

    def try_run_crm(self, action_id: str) -> dict | None:
        """Runs a CRM action if the gate allows it now. Returns None when it must wait."""
        try:
            row = self.db.one("SELECT public.ai_execute_crm_action(%s) AS result", action_id)
            return row["result"] if row else None
        except errors.RaiseException as err:
            log.info("action %s waiting: %s", action_id, err.diag.message_primary)
            return None

    def cancel_open_messages(self, conversation_id: str, agent_key: str) -> int:
        """Withdraws this agent's unsent replies in a conversation, so a newer draft replaces them."""
        rows = self.db.all(
            """UPDATE public.ai_actions SET status = 'cancelled'
               WHERE conversation_id = %s AND agent_key = %s AND status = 'proposed' AND action_type LIKE 'message.%%'
               RETURNING id""",
            conversation_id, agent_key,
        )
        return len(rows)

    def manager_decision(self, action_id: str, decision: str, note: str) -> None:
        """Only for Level 2 actions; the database refuses manager decisions on Level 3."""
        self.db.one(
            "INSERT INTO public.ai_approvals (action_id, decided_by_kind, decision, note) VALUES (%s, 'manager', %s, %s) RETURNING id",
            action_id, decision, note[:2000],
        )

    def notify_owner(self, kind: str, title: str, body: str = "", *, request_id: str | None = None,
                     action_id: str | None = None) -> None:
        self.db.one(
            "INSERT INTO public.ai_notifications (kind, title, body, request_id, action_id) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            kind, title[:200], body[:4000], request_id, action_id,
        )

    def log(self, agent_key: str, event: str, detail: dict[str, Any], *, task_id: str | None = None,
            request_id: str | None = None) -> None:
        self.db.one(
            "INSERT INTO public.ai_activity_log (actor_kind, agent_key, task_id, request_id, event, detail) VALUES ('agent', %s, %s, %s, %s, %s) RETURNING id",
            agent_key, task_id, request_id, event, jsonb(detail),
        )
