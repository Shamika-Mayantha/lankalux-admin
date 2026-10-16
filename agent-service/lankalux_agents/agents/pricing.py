"""Pricing Agent. Gives staff a pricing guide from what LankaLux has actually sold, as an
internal note on the request. It never quotes a customer: quotes and discounts are Level 3,
so only the owner can approve them (enforced by the database).

The guide is plain arithmetic over past sold requests (price per day, by currency), so it
cannot invent numbers. With fewer than 3 comparable sales it says so instead of guessing."""
from __future__ import annotations

import re
from statistics import median

from ..queue import Task
from .base import Agent, Context, Outcome

CURRENCIES = ("USD", "GBP", "EUR", "AUD", "LKR")
MIN_SAMPLES = 3


def parse_price(text: str | None) -> tuple[float, str] | None:
    """'Total Price: 660 USD' / 'GBP 688' / '560' -> (amount, currency). Bare numbers count as USD."""
    if not text:
        return None
    t = text.upper().replace(",", "")
    amount = re.search(r"\d+(?:\.\d+)?", t)
    if not amount:
        return None
    currency = next((c for c in CURRENCIES if c in t), "GBP" if "£" in t else "EUR" if "€" in t else "USD")
    return float(amount.group()), currency


def _days(row: dict) -> int | None:
    try:
        d = int(str(row.get("duration") or "").split()[0])
        return d if d > 0 else None
    except (ValueError, IndexError):
        return None


def price_guide(samples: list[dict], days: int | None) -> tuple[str, dict]:
    per_day: dict[str, list[float]] = {}
    for s in samples:
        p, d = parse_price(s.get("sold_price")), _days(s)
        if p and d:
            per_day.setdefault(p[1], []).append(p[0] / d)
    if not per_day or max(len(v) for v in per_day.values()) < MIN_SAMPLES:
        n = sum(len(v) for v in per_day.values())
        return (f"Pricing guide: only {n} past sale(s) with a price and length on record, not enough for a guide. "
                "Price this one manually."), {"samples": n}
    currency, rates = max(per_day.items(), key=lambda kv: len(kv[1]))
    lo, mid, hi = min(rates), median(rates), max(rates)
    line = (f"Pricing guide from {len(rates)} past sales in {currency}: about {mid:.0f} {currency} per day "
            f"(range {lo:.0f}-{hi:.0f}).")
    if days:
        line += f" For {days} days that is roughly {mid * days:.0f} {currency} (range {lo * days:.0f}-{hi * days:.0f})."
    line += " Internal guide only; the final quote is yours."
    return line, {"currency": currency, "samples": len(rates), "median_per_day": round(mid, 2)}


class PricingAgent(Agent):
    key = "pricing"
    handlers = {"price_guide": "price_guide"}

    def price_guide(self, task: Task, ctx: Context) -> Outcome:
        rid = task.request_id
        req = ctx.crm.request(rid) if rid else None
        if not req:
            return Outcome("failed", error=f"request {rid} not found")
        if self._has_guide(ctx, rid):
            return Outcome("succeeded", {"skipped": True, "reason": "guide already added"})
        note, stats = price_guide(ctx.crm.price_samples(), _days(req))
        action = ctx.actions.propose(agent_key=self.key, action_type="crm.add_note", task_id=task.id, request_id=rid,
                                     summary="Pricing guide", payload={"note": note})
        ran = ctx.actions.try_run_crm(str(action["id"]))
        return Outcome("succeeded", {**stats, "noted": ran is not None})

    @staticmethod
    def _has_guide(ctx: Context, rid: str) -> bool:
        return bool(ctx.actions.db.one(
            "SELECT 1 AS x FROM public.ai_actions WHERE request_id = %s AND agent_key = 'pricing' AND status = 'executed' LIMIT 1",
            rid,
        ))
