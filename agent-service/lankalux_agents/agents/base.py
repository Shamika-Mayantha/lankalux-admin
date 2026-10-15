from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from ..actions import Actions
from ..crm import CRM
from ..llm import LLM
from ..memory import Memory
from ..queue import Task, TaskQueue

AI_DISCLOSURE = (
    "You are LankaLux's AI concierge, an AI assistant for LankaLux, a private chauffeur and tailor-made travel "
    "company in Sri Lanka. You are not a human and never claim to be one. If asked, say you are an AI assistant "
    "and that a member of the LankaLux team can take over at any time."
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
