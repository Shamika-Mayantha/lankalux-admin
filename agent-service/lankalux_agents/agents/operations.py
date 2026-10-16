"""Operations Agent. Watches sold trips so nothing is missing on the day.

check_upcoming_trips (hourly, 8am-8pm Sri Lanka): for every sold trip starting within 7 days
it lists what is still missing (chauffeur, vehicle, chosen itinerary, arrival flight) and pings
the owner once a day per trip. status_changed: when a request becomes sold, it adds a short
internal checklist note. Plain code, no model: facts in, facts out."""
from __future__ import annotations

from datetime import date

from ..queue import Task
from .base import Agent, Context, Outcome

WINDOW_DAYS = 7


def missing_items(trip: dict) -> list[str]:
    missing = []
    if not trip.get("assigned_driver_id"):
        missing.append("a chauffeur")
    if not trip.get("assigned_vehicle_id"):
        missing.append("a vehicle")
    if not trip.get("selected_itinerary_id"):
        missing.append("a chosen itinerary")
    if not (trip.get("arrival_flight") or "").strip():
        missing.append("the arrival flight")
    return missing


def _when(start: date | str | None) -> str:
    if not start:
        return "soon"
    d = start if isinstance(start, date) else date.fromisoformat(str(start)[:10])
    days = (d - date.today()).days
    return "today" if days <= 0 else "tomorrow" if days == 1 else f"in {days} days ({d.strftime('%d %b')})"


class OperationsAgent(Agent):
    key = "operations"
    handlers = {"status_changed": "status_changed", "check_upcoming_trips": "check_upcoming_trips"}

    def check_upcoming_trips(self, task: Task, ctx: Context) -> Outcome:
        flagged: list[str] = []
        for trip in ctx.crm.upcoming_sold_trips(WINDOW_DAYS):
            missing = missing_items(trip)
            if not missing:
                continue
            who = trip.get("client_name") or trip["id"]
            title = f"{who} arrives {_when(trip.get('start_date'))}: still needs {', '.join(missing)}"
            # One ping per trip per day; the title changes as the day gets closer.
            if ctx.crm.notified_recently(title, hours=20):
                continue
            ctx.actions.notify_owner("attention", title, "Assign it on the request page so the trip is ready.",
                                     request_id=trip["id"])
            flagged.append(trip["id"])
        return Outcome("succeeded", {"flagged": flagged})

    def status_changed(self, task: Task, ctx: Context) -> Outcome:
        ev = task.payload.get("event") or {}
        new_status = ((ev.get("payload") or {}).get("new_status") or (ev.get("payload") or {}).get("status") or "").lower()
        if new_status != "sold" or not task.request_id:
            return Outcome("succeeded", {"skipped": True, "reason": f"status {new_status or 'unknown'}"})
        req = ctx.crm.request(task.request_id)
        if not req:
            return Outcome("failed", error=f"request {task.request_id} not found")
        missing = missing_items(req)
        note = "Sold. Operations checklist: " + (
            "still to arrange " + ", ".join(missing) + "." if missing else "chauffeur, vehicle, itinerary and flight are all in place."
        )
        action = ctx.actions.propose(agent_key=self.key, action_type="crm.add_note", task_id=task.id,
                                     request_id=task.request_id, summary="Operations checklist", payload={"note": note})
        ran = ctx.actions.try_run_crm(str(action["id"]))
        return Outcome("succeeded", {"missing": missing, "noted": ran is not None})
