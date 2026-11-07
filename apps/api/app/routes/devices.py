import re

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import delete, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth import current_user
from app.db import get_db
from app.errors import ApiError
from app.models import PushDevice, User

router = APIRouter()
TOKEN_RE = re.compile(r"Expo(nent)?PushToken\[.+\]")


class DeviceIn(BaseModel):
    token: str
    platform: str


@router.post("/devices", status_code=204)
def register_device(body: DeviceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if len(body.token) > 255 or not TOKEN_RE.fullmatch(body.token) or body.platform not in ("android", "ios"):
        raise ApiError(400, "INVALID_PUSH_TOKEN", "푸시 토큰이 올바르지 않습니다.")
    # 같은 폰에서 다른 계정으로 로그인하면 토큰을 새 사용자로 옮긴다.
    stmt = insert(PushDevice).values(token=body.token, user_id=user.id, platform=body.platform)
    db.execute(stmt.on_conflict_do_update(
        index_elements=["token"],
        set_={"user_id": user.id, "platform": body.platform, "updated_at": func.now()}))
    db.commit()
    return Response(status_code=204)


@router.delete("/devices", status_code=204)
def delete_device(token: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(PushDevice).where(PushDevice.token == token, PushDevice.user_id == user.id))
    db.commit()
    return Response(status_code=204)
