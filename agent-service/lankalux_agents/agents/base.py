from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from ..actions import Actions
from ..crm import CRM
from ..llm import LLM
from ..memory import Memory
from ..queue import Task, TaskQueue

AI_DISCLOSURE = (
    "You write WhatsApp messages for LankaLux, a private chauffeur and tailor-made travel company in Sri Lanka, "
    "as a friendly member of the sales team. Never claim to be a human and never deny being automated: if a "
    "customer asks, hand the conversation to the owner instead of answering."
)


@dataclass
class Context:
    queue: TaskQueue
    llm: LLM
    actions: Actions
    crm: CRM
    memory: Memory
    prompts: dict[str, str] = field(default_factory=dict)  # owner-approved prompts from ai_agents


@dataclass
class Outcome:
    """How a task ended. 'waiting' means an approval or a person is needed."""
    status: str = "succeeded"  # succeeded | waiting | failed | retry
    result: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    retry_in: int | None = None


Handler = Callable[[Task, Context], Outcome]


class Agent:
    key: str = ""
    handlers: dict[str, str] = {}  # task_type -> method name

    def handle(self, task: Task, ctx: Context) -> Outcome:
        name = self.handlers.get(task.task_type)
        if not name:
            return Outcome("failed", error=f"{self.key} has no handler for {task.task_type}")
        return getattr(self, name)(task, ctx)

    def system_prompt(self, ctx: Context, default: str) -> str:
        """The owner-approved prompt from ai_agents when set, else the built-in default."""
        return ctx.prompts.get(self.key) or default


def not_enabled(agent: str, task: Task) -> Outcome:
    return Outcome("succeeded", {"skipped": True, "reason": f"{agent}.{task.task_type} is not enabled yet"})


def request_review(ctx: Context, action: dict, parent: Task, *, priority: int = 25) -> str | None:
    """Every Level 2 proposal goes to the Quality Agent, which hands it to the AI Manager.
    The Manager's approval is what lets it run (the database checks that, not this code)."""
    return ctx.queue.enqueue(
        "quality", "review_action", {"action_id": str(action["id"])}, request_id=parent.request_id,
        parent=parent, dedupe_key=f"review:{action['id']}", priority=priority, created_by=parent.agent_key,
        conversation_id=parent.conversation_id,
    )
