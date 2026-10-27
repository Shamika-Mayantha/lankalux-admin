from __future__ import annotations

import json

import httpx
import pytest
from pydantic import BaseModel

from lankalux_agents.llm import LLMError, OllamaLLM


class Answer(BaseModel):
    text: str


def make_llm(handler) -> OllamaLLM:
    llm = OllamaLLM("http://ollama", "qwen3:8b", "embed")
    llm.http = httpx.Client(transport=httpx.MockTransport(handler))
    return llm


def test_observer_hears_start_and_end():
    llm = make_llm(lambda req: httpx.Response(200, json={"message": {"content": json.dumps({"text": "hi"})}, "eval_count": 7}))
    heard: list[tuple[str, dict]] = []
    llm.observer = lambda phase, detail: heard.append((phase, detail))
    assert llm.structured("sys", "user", Answer).text == "hi"
    assert [p for p, _ in heard] == ["start", "end"]
    assert heard[0][1] == {"model": "qwen3:8b", "schema": "Answer"}
    assert heard[1][1]["ok"] is True and heard[1][1]["output_tokens"] == 7


def test_observer_hears_failed_call_end():
    llm = make_llm(lambda req: httpx.Response(500))
    heard: list[str] = []
    llm.observer = lambda phase, detail: heard.append(f"{phase}:{detail.get('ok', '')}")
    with pytest.raises(LLMError):
        llm.structured("sys", "user", Answer)
    assert heard == ["start:", "end:False"]


def test_broken_observer_never_breaks_the_call():
    llm = make_llm(lambda req: httpx.Response(200, json={"message": {"content": json.dumps({"text": "ok"})}}))

    def boom(*_):
        raise RuntimeError("db down")

    llm.observer = boom
    assert llm.structured("sys", "user", Answer).text == "ok"
