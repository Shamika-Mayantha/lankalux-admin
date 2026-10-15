"""Benchmarks candidate models on the VM with LankaLux-shaped work, before we pick one.

  lankalux-bench --models qwen3:4b,qwen3:8b,gemma3:4b --runs 3 --out bench.json

Needs only Ollama (no database). Prints a table: load memory, prompt and output speed,
wall time per job, and whether the structured output validated.
"""
from __future__ import annotations

import argparse
import json
import platform
import statistics
import time

import httpx
from pydantic import ValidationError

from .agents.manager import Review
from .agents.sales import Qualification
from .llm import LLMError, OllamaLLM

ENQUIRY = {
    "request": {
        "client_name": "Anna Becker", "origin_country": "Germany", "status": "follow_up",
        "start_date": "2027-02-03", "end_date": "2027-02-14", "number_of_adults": 2, "number_of_children": 1,
        "children_ages": None, "interests": "wildlife, tea country, beaches", "budget": None,
        "additional_preferences": "We would love a train ride and a safari. Our daughter is small. "
                                  "Is it safe to travel in February? We prefer boutique hotels. " * 6,
    },
    "messages": [{"direction": "inbound", "channel": "email",
                  "body": "Hello, we are a family of three looking for a private driver for 12 days. " * 10}],
}

JOBS = [
    ("qualify_lead (JSON)", "You help the LankaLux sales team. List missing travel details and readiness.",
     ENQUIRY, Qualification),
    ("manager_review (JSON)", "You are the AI General Manager. Approve or reject this draft reply.",
     {"action": {"action_type": "message.routine_reply", "summary": "Answer weather question",
                 "payload": {"text": "February is dry season in the hill country and south coast, a lovely time to visit."}},
      "request": ENQUIRY["request"]}, Review),
]


def ram_used_mb(base: str, model: str) -> float | None:
    try:
        for m in httpx.get(f"{base}/api/ps", timeout=10).json().get("models", []):
            if m.get("name", "").startswith(model):
                return round(m.get("size", 0) / 1e6)
    except httpx.HTTPError:
        return None
    return None


def bench_model(base: str, model: str, runs: int) -> dict:
    llm = OllamaLLM(base, model, embed_model="nomic-embed-text")
    t0 = time.monotonic()
    try:
        llm.structured("Reply with JSON.", "Say ok.", Review)
    except LLMError:
        pass
    load_s = round(time.monotonic() - t0, 1)
    out: dict = {"model": model, "load_s": load_s, "ram_mb": ram_used_mb(base, model), "jobs": {}}
    for name, system, facts, schema in JOBS:
        stats, valid = [], 0
        for _ in range(runs):
            try:
                llm.structured(system, json.dumps(facts), schema, retries=0)
                valid += 1
            except (LLMError, ValidationError):
                pass
            stats.append(llm.last_stats)
        out["jobs"][name] = {
            "valid": f"{valid}/{runs}",
            "wall_s": statistics.median(s.get("wall_s", 0) for s in stats),
            "prompt_tokens": statistics.median(s.get("prompt_tokens", 0) for s in stats),
            "prompt_tps": statistics.median(s.get("prompt_tps", 0) for s in stats),
            "output_tps": statistics.median(s.get("output_tps", 0) for s in stats),
        }
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--ollama", default="http://127.0.0.1:11434")
    p.add_argument("--models", default="qwen3:4b,qwen3:8b,gemma3:4b,llama3.2:3b")
    p.add_argument("--runs", type=int, default=3)
    p.add_argument("--out", default="bench.json")
    a = p.parse_args()
    results = {"machine": platform.machine(), "cpus": __import__("os").cpu_count(), "models": []}
    for model in a.models.split(","):
        print(f"benchmarking {model} ...", flush=True)
        try:
            results["models"].append(bench_model(a.ollama, model.strip(), a.runs))
        except Exception as err:
            results["models"].append({"model": model, "error": str(err)})
    with open(a.out, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n{'model':<16}{'load s':>8}{'RAM MB':>8}  job                    valid  wall s  prompt t/s  output t/s")
    for m in results["models"]:
        if "error" in m:
            print(f"{m['model']:<16} error: {m['error']}")
            continue
        for job, j in m["jobs"].items():
            print(f"{m['model']:<16}{m['load_s']:>8}{str(m['ram_mb']):>8}  {job:<22} {j['valid']:>5} {j['wall_s']:>7} "
                  f"{j['prompt_tps']:>11} {j['output_tps']:>11}")
    print(f"\nSaved {a.out}")


if __name__ == "__main__":
    main()
