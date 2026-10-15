"""The agent service process. One worker, one model call at a time (the VM has no GPU).

Restart-safe: all state is in Postgres. A task that was running when the process died
is re-claimed when its lease expires; systemd restarts the process.
"""
from __future__ import annotations

import logging
import signal
import sys
import time

from .actions import Actions
from .agents import ALL_AGENTS, Agent, Context, Outcome
from .config import Settings
from .crm import CRM
from .db import Database
from .events import pump_events, schedule
from .llm import LLMError, OllamaLLM
from .memory import Memory
from .queue import Task, TaskQueue

log = logging.getLogger("lankalux_agents")
HEARTBEAT_SECONDS = 60


class Worker:
    def __init__(self, ctx: Context, db: Database, agents: dict[str, Agent], poll_seconds: float):
        self.ctx = ctx
        self.db = db
        self.agents = agents
        self.poll_seconds = poll_seconds
        self.stopping = False
        self._last_beat = 0.0

    def stop(self, *_: object) -> None:
        log.info("stopping after the current task")
        self.stopping = True

    def run_task(self, task: Task) -> Outcome:
        agent = self.agents.get(task.agent_key)
        if not agent:
            return Outcome("failed", error=f"unknown agent {task.agent_key}")
        try:
            return agent.handle(task, self.ctx)
        except LLMError as err:
            return Outcome("retry", error=str(err), retry_in=120 * task.attempts)
        except Exception as err:  # never let one task kill the worker
            log.exception("task %s failed", task.id)
            return Outcome("retry", error=f"{type(err).__name__}: {err}", retry_in=60 * task.attempts)

    def tick(self) -> bool:
        """One loop pass. Returns True when a task ran."""
        self.heartbeat()
        # While paused, only check in: events wait in ai_events and nothing is queued,
        # so pressing Start does not release a backlog of scheduled scans.
        if self.paused():
            return False
        pump_events(self.db, self.ctx.queue)
        schedule(self.ctx.queue)
        tasks = self.ctx.queue.claim(1)
        if not tasks:
            return False
        task = tasks[0]
        started = time.monotonic()
        out = self.run_task(task)
        self.ctx.queue.complete(task, out.status, out.result, out.error, out.retry_in)
        self.ctx.actions.log(task.agent_key, f"task.{out.status}",
                             {"task_type": task.task_type, "seconds": round(time.monotonic() - started, 1),
                              "error": out.error}, task_id=task.id, request_id=task.request_id)
        return True

    def paused(self) -> bool:
        row = self.db.one("SELECT system_paused FROM public.ai_settings WHERE id")
        return bool(row is None or row["system_paused"])

    def heartbeat(self, error: str | None = None) -> None:
        if time.monotonic() - self._last_beat < HEARTBEAT_SECONDS:
            return
        for key in self.agents:
            self.db.one("SELECT public.ai_heartbeat(%s, %s)", key, error)
        self.ctx.prompts.update(load_prompts(self.db))
        self._last_beat = time.monotonic()

    def run_forever(self) -> None:
        while not self.stopping:
            try:
                if not self.tick():
                    time.sleep(self.poll_seconds)
            except Exception:  # database blip: back off, systemd keeps us alive
                log.exception("loop error")
                time.sleep(min(60, self.poll_seconds * 6))


def load_prompts(db: Database) -> dict[str, str]:
    """Owner-approved prompts. The agent role can read but never write these."""
    return {r["key"]: r["system_prompt"] for r in db.all("SELECT key, system_prompt FROM public.ai_agents") if r["system_prompt"]}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s", stream=sys.stdout)
    settings = Settings.from_env()
    log.info("starting %s", settings.redacted())
    db = Database(settings.database_url)
    llm = OllamaLLM(settings.ollama_url, settings.model, settings.embed_model)
    queue = TaskQueue(db, settings.worker_id, settings.lease_seconds)
    ctx = Context(queue=queue, llm=llm, actions=Actions(db), crm=CRM(db), memory=Memory(db, llm))
    worker = Worker(ctx, db, {cls.key: cls() for cls in ALL_AGENTS}, settings.poll_seconds)
    signal.signal(signal.SIGTERM, worker.stop)
    signal.signal(signal.SIGINT, worker.stop)
    worker.run_forever()
    db.close()


if __name__ == "__main__":
    main()
