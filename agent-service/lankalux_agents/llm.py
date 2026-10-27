"""Local model access through Ollama. Structured output only: every agent call asks for
JSON matching a pydantic schema, and anything that does not validate is rejected, never
acted on."""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Callable, Protocol, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)
log = logging.getLogger(__name__)


class LLMError(RuntimeError):
    pass


class LLM(Protocol):
    def structured(self, system: str, user: str, schema: type[T], *, temperature: float = 0.2) -> T: ...
    def embed(self, text: str) -> list[float]: ...


class OllamaLLM:
    def __init__(self, base_url: str, model: str, embed_model: str, timeout: float = 600):
        self.base_url = base_url
        self.model = model
        self.embed_model = embed_model
        self.http = httpx.Client(timeout=timeout)
        self.last_stats: dict[str, float] = {}
        # Told when a model call starts and ends, so the AI Headquarters can show an agent
        # thinking. Set by the worker around each task; never allowed to break a call.
        self.observer: Callable[[str, dict[str, Any]], None] | None = None

    def _notify(self, phase: str, detail: dict[str, Any]) -> None:
        if self.observer:
            try:
                self.observer(phase, detail)
            except Exception:
                log.warning("llm observer failed", exc_info=True)

    def structured(self, system: str, user: str, schema: type[T], *, temperature: float = 0.2, retries: int = 1) -> T:
        body = {
            "model": self.model,
            "stream": False,
            "think": False,
            # keep_alive -1 keeps the model resident: no cold start per message.
            "keep_alive": -1,
            "format": schema.model_json_schema(),
            "options": {"temperature": temperature, "num_ctx": 8192},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        last_err: Exception | None = None
        for _ in range(retries + 1):
            started = time.monotonic()
            self._notify("start", {"model": self.model, "schema": schema.__name__})
            try:
                res = self.http.post(f"{self.base_url}/api/chat", json=body)
                res.raise_for_status()
                data = res.json()
            except httpx.HTTPError as err:
                self._notify("end", {"model": self.model, "ok": False, "seconds": round(time.monotonic() - started, 1)})
                raise LLMError(f"Ollama request failed: {err}") from err
            self._record_stats(data, time.monotonic() - started)
            self._notify("end", {"model": self.model, "ok": True, "seconds": self.last_stats["wall_s"],
                                 "output_tokens": self.last_stats["output_tokens"]})
            content = (data.get("message") or {}).get("content", "")
            try:
                return schema.model_validate(json.loads(content))
            except (json.JSONDecodeError, ValidationError) as err:
                last_err = err
        raise LLMError(f"Model output did not match {schema.__name__}: {last_err}")

    def embed(self, text: str) -> list[float]:
        res = self.http.post(f"{self.base_url}/api/embed", json={"model": self.embed_model, "input": text, "keep_alive": -1})
        res.raise_for_status()
        return res.json()["embeddings"][0]

    def _record_stats(self, data: dict, wall: float) -> None:
        ns = 1e9
        self.last_stats = {
            "wall_s": round(wall, 2),
            "prompt_tokens": data.get("prompt_eval_count", 0),
            "prompt_tps": round(data.get("prompt_eval_count", 0) / max(data.get("prompt_eval_duration", 1) / ns, 1e-9), 1),
            "output_tokens": data.get("eval_count", 0),
            "output_tps": round(data.get("eval_count", 0) / max(data.get("eval_duration", 1) / ns, 1e-9), 1),
        }
