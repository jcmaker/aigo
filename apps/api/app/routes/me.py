from clerk_backend_api import Clerk
from fastapi import APIRouter, Depends, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import quota
from app.auth import _clerk_down, current_user, get_clerk
from app.db import get_db
from app.models import Analysis, User
from app.storage import Storage, get_storage

router = APIRouter()


@router.get("/me")
def get_me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "name": user.name}


@router.delete("/me", status_code=204)
def delete_me(user: User = Depends(current_user), db: Session = Depends(get_db),
              storage: Storage = Depends(get_storage), clerk: Clerk = Depends(get_clerk)):
    # 순서: 파일 -> DB -> Clerk. 분석은 내용을 지우되 행은 user_id NULL로 남겨 하루 한도 집계를 보존한다.
    # 주문은 DB가 user_id를 NULL로 바꿔 보관한다.
    clerk_user_id, user_id = user.clerk_user_id, user.id
    now = quota._now()
    for a in db.scalars(select(Analysis).where(Analysis.user_id == user_id)).all():
        storage.delete_analysis_files(a.id)
        a.erase(now)
        a.user_id = None  # 한도 집계용 빈 행만 남긴다.
    db.flush()
    db.execute(delete(User).where(User.id == user_id))
    db.commit()
    try:
        clerk.users.delete(user_id=clerk_user_id)
    except Exception as e:
        # 재시도하면 current_user가 행을 다시 만들고 탈퇴를 이어간다.
        raise _clerk_down() from e
    return Response(status_code=204)
