import base64
import json
import time

import cv2
import httpx2
import numpy as np
import pytest
from openai import OpenAI
from pydantic import BaseModel

from app.config import settings
from app.errors import PipelineError
from app.llm import (JOB_DEADLINE_S, JPEG_QUALITY, LLM, LONG_EDGE, MAX_OUTPUT_TOKENS, MAX_RETRIES, REQUEST_TIMEOUT_S,
                     InvalidOutput, ask, image_part)
from tests.fixtures.fake_llm import FakeLLM


class Out(BaseModel):
    answer: str
    t: float | None


def _reply(content: dict, status="completed") -> dict:
    return {"id": "resp_1", "object": "response", "created_at": 1, "model": "m", "status": status,
            "parallel_tool_calls": True, "tool_choice": "auto", "tools": [],
            "output": [{"id": "msg_1", "type": "message", "role": "assistant", "status": "completed",
                        "content": [content]}],
            "usage": {"input_tokens": 100, "output_tokens": 20, "total_tokens": 120,
                      "input_tokens_details": {"cached_tokens": 0, "cache_write_tokens": 0},
                      "output_tokens_details": {"reasoning_tokens": 7}}}


def _text(payload: str) -> dict:
    return {"type": "output_text", "text": payload, "annotations": []}


def _llm(handler) -> LLM:
    client = OpenAI(api_key="test", max_retries=0, http_client=httpx2.Client(transport=httpx2.MockTransport(handler)))
    return LLM(client)


def test_parse_structured_sends_schema_and_records_tokens():
    sent = {}

    def handler(req):
        sent.update(json.loads(req.content))
        return httpx2.Response(200, json=_reply(_text('{"answer": "네", "t": 1.5}')))

    llm = _llm(handler)
    got = llm.parse_structured([{"role": "user", "content": "질문"}], Out)
    assert got == Out(answer="네", t=1.5)
    assert sent["model"] == settings.openai_model
    assert sent["reasoning"]["effort"] == settings.openai_reasoning_effort
    assert sent["text"]["format"]["type"] == "json_schema" and sent["text"]["format"]["strict"] is True
    assert sent["max_output_tokens"] == MAX_OUTPUT_TOKENS
    assert sent["store"] is False  # 사고 영상 프레임을 OpenAI에 보관하지 않는다.
    assert llm.calls[0]["schema"] == "Out"
    assert (llm.calls[0]["input_tokens"], llm.calls[0]["output_tokens"], llm.calls[0]["reasoning_tokens"]) == (100, 20, 7)


def test_repair_text_is_appended_as_last_message():
    sent = {}

    def handler(req):
        sent.update(json.loads(req.content))
        return httpx2.Response(200, json=_reply(_text('{"answer": "네", "t": null}')))

    _llm(handler).parse_structured([{"role": "user", "content": "질문"}], Out, repair="없는 도표")
    assert len(sent["input"]) == 2 and "없는 도표" in str(sent["input"][-1])


@pytest.mark.parametrize("content", [
    {"type": "refusal", "refusal": "못 합니다"},
    _text('{"answer": 3}'),
])
def test_refusal_or_bad_json_is_invalid_output(content):
    llm = _llm(lambda req: httpx2.Response(200, json=_reply(content)))
    with pytest.raises(InvalidOutput):
        llm.parse_structured([{"role": "user", "content": "질문"}], Out)
    assert llm.calls[0]["input_tokens"] == 100 and llm.calls[0]["valid"] is False  # 실패해도 쓴 토큰은 남는다.


def test_production_client_config(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "test")
    c = LLM().client
    assert c.max_retries == MAX_RETRIES == 1 and c.timeout == REQUEST_TIMEOUT_S
    assert JOB_DEADLINE_S == 300


def test_job_deadline_stops_further_calls():
    def handler(req):
        raise AssertionError("호출되면 안 된다")

    llm = _llm(handler)
    llm.deadline = time.monotonic() - 1
    with pytest.raises(PipelineError) as e:
        llm.parse_structured([{"role": "user", "content": "질문"}], Out)
    assert e.value.code == "MODEL_TIMEOUT"


def test_request_timeout_shrinks_to_fit_the_deadline():
    seen = {}

    def handler(req):
        seen.update(req.extensions["timeout"])
        return httpx2.Response(200, json=_reply(_text('{"answer": "네", "t": null}')))

    llm = _llm(handler)
    llm.deadline = time.monotonic() + 20
    llm.parse_structured([{"role": "user", "content": "질문"}], Out)
    assert seen["read"] <= 10  # 재시도 1회까지 합쳐 기한 안이다.


def test_api_error_becomes_user_message():
    llm = _llm(lambda req: httpx2.Response(401, json={"error": {"message": "bad key"}}))
    with pytest.raises(PipelineError) as e:
        llm.parse_structured([{"role": "user", "content": "질문"}], Out)
    assert e.value.code == "MODEL_FAILED" and "bad key" not in e.value.message


def test_ask_retries_once_with_the_error_then_succeeds():
    good = Out(answer="네", t=None)
    llm = FakeLLM(InvalidOutput("스키마 오류"), good)
    assert ask(llm, [], Out) == good
    assert [s[2] for s in llm.seen] == [None, "스키마 오류"]


def test_ask_fails_after_one_retry():
    llm = FakeLLM(Out(answer="x", t=None), Out(answer="x", t=None))

    def check(out):
        raise InvalidOutput("틀림")

    with pytest.raises(PipelineError) as e:
        ask(llm, [], Out, check)
    assert e.value.code == "MODEL_INVALID" and llm.responses == []


def test_image_part_is_shrunk_jpeg_data_url(tmp_path):
    p = tmp_path / "f.png"
    cv2.imwrite(str(p), np.full((1080, 2560, 3), 128, np.uint8))
    part = image_part(p)
    assert part["type"] == "input_image" and part["image_url"].startswith("data:image/jpeg;base64,")
    raw = base64.b64decode(part["image_url"].split(",", 1)[1])
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    assert max(img.shape[:2]) == LONG_EDGE and 1 <= JPEG_QUALITY <= 100


def test_small_image_is_not_enlarged(tmp_path):
    p = tmp_path / "f.jpg"
    cv2.imwrite(str(p), np.full((180, 320, 3), 128, np.uint8))
    raw = base64.b64decode(image_part(p)["image_url"].split(",", 1)[1])
    assert cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR).shape[:2] == (180, 320)
