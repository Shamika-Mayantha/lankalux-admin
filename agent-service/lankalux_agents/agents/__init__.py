from .base import Agent, Context, Outcome
from .followup import FollowUpAgent
from .manager import ManagerAgent
from .operations import OperationsAgent
from .planner import PlannerAgent
from .pricing import PricingAgent
from .quality import QualityAgent
from .sales import SalesAgent
from .scout import ScoutAgent

ALL_AGENTS: list[type[Agent]] = [
    ManagerAgent, SalesAgent, PlannerAgent, PricingAgent, FollowUpAgent, OperationsAgent, QualityAgent, ScoutAgent,
]

__all__ = ["ALL_AGENTS", "Agent", "Context", "Outcome"]
