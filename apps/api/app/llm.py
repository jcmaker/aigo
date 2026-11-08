import base64
import logging
import time
from collections.abc import Callable
from functools import cached_property
from pathlib import Path
from typing import Any, TypeVar

import cv2
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, ValidationError

from app.config import settings
from app.errors import PipelineError

log = logging.getLogger("llm")
T = TypeVar("T", bound=BaseModel)

PROMPT_VERSION = "2026-11-06.2"  # 프롬프트를 바꾸면 올리고 평가 세트를 다시 돌린다.
JPEG_QUALITY = 85
LONG_EDGE = 1280
REQUEST_TIMEOUT_S = 180
MAX_RETRIES = 1  # 네트워크와 5xx 재시도. 내용 재요청(ask)과는 따로 센다.
MAX_OUTPUT_TOKENS = 6000  # 실측 최대 약 1100. 비용 상한이다.
JOB_DEADLINE_S = 300  # 분석 하나가 OpenAI에 쓸 수 있는 전체 시간


class InvalidOutput(ValueError):
    """모델 응답이 스키마나 코드 검증을 통과하지 못했다. 메시지는 재요청에 그대로 쓴다."""


def image_part(path: Path) -> dict:
    img = cv2.imread(str(path))
    scale = LONG_EDGE / max(img.shape[:2])
    if scale < 1:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    jpeg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])[1].tobytes()
    return {"type": "input_image", "detail": "high",
            "image_url": "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()}


class LLM:
    """분석 하나에 하나씩 만든다. calls에 쌓인 호출 기록이 trace로 간다."""

    def __init__(self, client: OpenAI | None = None):
        self._given = client
        self.calls: list[dict] = []
        self.deadline: float | None = None  # 첫 호출 때 정한다.

    @cached_property
    def client(self) -> OpenAI:  # 키가 없어도 worker와 테스트가 뜨도록 첫 호출 때 만든다.
        return self._given or OpenAI(api_key=settings.openai_api_key, timeout=REQUEST_TIMEOUT_S,
                                     max_retries=MAX_RETRIES)

    def parse_structured(self, messages: list[dict], schema: type[T], *, repair: str | None = None) -> T:
        if repair:
            messages = [*messages, {"role": "user", "content": f"직전 응답이 검증에 실패했다: {repair}\n고쳐서 다시 답하라."}]
        if self.deadline is None:
            self.deadline = time.monotonic() + JOB_DEADLINE_S
        left = self.deadline - time.monotonic()
        if left <= 0:
            raise PipelineError("MODEL_TIMEOUT", "AI 분석 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.")
        started = time.perf_counter()
        try:
            # 스키마 검증에 실패해도 쓴 토큰은 남겨야 하므로 원본 응답을 받아 usage를 먼저 기록한다.
            raw = self.client.responses.with_raw_response.parse(
                model=settings.openai_model, input=messages, text_format=schema,
                reasoning={"effort": settings.openai_reasoning_effort}, max_output_tokens=MAX_OUTPUT_TOKENS,
                timeout=min(REQUEST_TIMEOUT_S, left / (MAX_RETRIES + 1)),  # 재시도까지 합쳐 기한 안에 끝나게 한다.
                store=False)  # 번호판과 얼굴이 담긴 프레임을 OpenAI 쪽에 남기지 않는다.
        except OpenAIError as e:
            log.exception("모델 호출 실패")
            raise PipelineError("MODEL_FAILED", "AI 분석 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.") from e
        u = raw.http_response.json().get("usage") or {}
        call = {"schema": schema.__name__, "seconds": round(time.perf_counter() - started, 2), "valid": False,
                "input_tokens": u.get("input_tokens", 0), "output_tokens": u.get("output_tokens", 0),
                "reasoning_tokens": (u.get("output_tokens_details") or {}).get("reasoning_tokens", 0)}
        self.calls.append(call)
        try:
            parsed = raw.parse().output_parsed
        except ValidationError as e:
            raise InvalidOutput(f"응답이 스키마와 다르다: {e.error_count()}개 오류") from e
        if parsed is None:
            raise InvalidOutput("응답이 비었거나 거절됐거나 길이 제한에 걸렸다")
        call["valid"] = True
        return parsed


def ask(llm: Any, messages: list[dict], schema: type[T], check: Callable[[T], None] = lambda _: None) -> T:
    """스키마나 코드 검증에 실패하면 오류를 알려 주고 한 번만 다시 묻는다."""
    repair = None
    for _ in range(2):
        try:
            out = llm.parse_structured(messages, schema, repair=repair)
            check(out)
            return out
        except InvalidOutput as e:
            repair = str(e)
    raise PipelineError("MODEL_INVALID", "AI 분석 결과를 확인하지 못했습니다. 영상을 다시 올려 주세요.")
