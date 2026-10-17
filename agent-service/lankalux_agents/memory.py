"""Shared memory: customer facts, past experiences and owner corrections, retrieved by
similarity so agents reuse what the owner taught them. Business rules only count once
the owner approved them (the database refuses agent-written approved rules)."""
from __future__ import annotations

import logging

from .db import Database
from .llm import LLM

log = logging.getLogger(__name__)


def _vec(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.6f}" for v in values) + "]"


class Memory:
    def __init__(self, db: Database, llm: LLM):
        self.db = db
        self.llm = llm

    def remember(self, kind: str, content: str, *, agent_key: str | None = None, request_id: str | None = None,
                 tags: list[str] | None = None) -> str:
        try:
            emb = _vec(self.llm.embed(content))
        except Exception as err:  # memory without an embedding is still searchable by request
            log.warning("embedding failed: %s", err)
            emb = None
        row = self.db.one(
            """INSERT INTO public.ai_memory (kind, agent_key, request_id, content, tags, embedding)
               VALUES (%s, %s, %s, %s, %s, %s::extensions.vector) RETURNING id""",
            kind, agent_key, request_id, content, tags or [], emb,
        )
        return str(row["id"])

    def recall(self, query: str, *, limit: int = 5, request_id: str | None = None) -> list[dict]:
        """Similar corrections/experiences plus approved business rules, and this customer's facts."""
        rows: list[dict] = []
        if request_id:
            rows += self.db.all(
                "SELECT kind, content, created_at FROM public.ai_memory WHERE request_id = %s ORDER BY created_at DESC LIMIT 10",
                request_id,
            )
        try:
            emb = _vec(self.llm.embed(query))
        except Exception as err:
            log.warning("embedding failed: %s", err)
            return rows
        # The agent role's search_path doesn't include the extensions schema, so the
        # pgvector operator is named in full. A failed lookup only loses context.
        try:
            rows += self.db.all(
                """SELECT kind, content, created_at,
                          1 - (embedding OPERATOR(extensions.<=>) %s::extensions.vector) AS similarity
                   FROM public.ai_memory
                   WHERE embedding IS NOT NULL
                     AND (kind IN ('correction', 'experience') OR (kind = 'business_rule' AND approved))
                   ORDER BY embedding OPERATOR(extensions.<=>) %s::extensions.vector LIMIT %s""",
                emb, emb, limit,
            )
        except Exception as err:
            log.warning("memory search failed: %s", err)
        return rows
