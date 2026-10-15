from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    ollama_url: str
    model: str
    embed_model: str
    worker_id: str
    poll_seconds: float
    lease_seconds: int
    admin_api_url: str
    admin_api_secret: str

    @classmethod
    def from_env(cls) -> "Settings":
        url = os.environ.get("AGENT_DATABASE_URL", "")
        if not url:
            raise SystemExit("AGENT_DATABASE_URL is not set")
        return cls(
            database_url=url,
            ollama_url=os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"),
            model=os.environ.get("AGENT_MODEL", "qwen3:4b"),
            embed_model=os.environ.get("EMBED_MODEL", "nomic-embed-text"),
            worker_id=os.environ.get("WORKER_ID", os.uname().nodename),
            poll_seconds=float(os.environ.get("POLL_SECONDS", "5")),
            lease_seconds=int(os.environ.get("LEASE_SECONDS", "600")),
            admin_api_url=os.environ.get("ADMIN_AGENT_API_URL", "").rstrip("/"),
            admin_api_secret=os.environ.get("ADMIN_AGENT_API_SECRET", ""),
        )

    def redacted(self) -> dict[str, str]:
        """Safe to log: never includes the database password or API secret."""
        host = self.database_url.split("@")[-1].split("?")[0]
        return {"db": host, "ollama": self.ollama_url, "model": self.model, "worker": self.worker_id}
