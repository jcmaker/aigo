import logging
from collections.abc import Callable

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import PushDevice

log = logging.getLogger("push")
EXPO_URL = "https://exp.host/--/api/v2/push/send"


def send_expo(messages: list[dict]) -> list[dict]:
    """Expo Push에 한 번에 보내고 messages와 같은 순서의 결과(ticket)를 돌려준다."""
    # ponytail: Expo는 요청당 100개까지다. 한 사용자의 기기가 100대를 넘을 일은 없다고 본다.
    r = httpx.post(EXPO_URL, json=messages, timeout=5)
    r.raise_for_status()
    return r.json()["data"]


def notify_analysis(db: Session, user_id: int | None, analysis_id: int, ok: bool,
                    send: Callable[[list[dict]], list[dict]] = send_expo) -> None:
    """분석 결과를 푸시한다. 어떤 실패도 밖으로 내보내지 않는다. 잠금 화면에 보이므로 사고 내용은 넣지 않는다."""
    if user_id is None:
        return
    try:
        tokens = list(db.scalars(select(PushDevice.token).where(PushDevice.user_id == user_id)))
        if not tokens:
            return
        body = "분석이 끝났습니다." if ok else "분석에 실패했습니다."
        tickets = send([{"to": t, "title": "AIGO", "body": body, "data": {"analysis_id": analysis_id}}
                        for t in tokens])
        dead = [t for t, k in zip(tokens, tickets)
                if (k.get("details") or {}).get("error") == "DeviceNotRegistered"]
        if dead:
            db.execute(delete(PushDevice).where(PushDevice.token.in_(dead)))
            db.commit()
    except Exception:
        log.exception("푸시 발송 실패 %s", analysis_id)
        try:
            db.rollback()
        except Exception:
            log.exception("푸시 롤백 실패 %s", analysis_id)
